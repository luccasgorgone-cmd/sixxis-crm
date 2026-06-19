// Vendedor/pos-venda (ou admin) assume um cliente SEM dono NAQUELA finalidade:
// vira dono do lead (campo da finalidade) e do negocio aberto. Espelha o dono
// nas conversas. Registra Atividade(ASSUMIDO) e historico do negocio.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import { campoDono, temAcesso, espelharDonoNasConversas } from "@/lib/dono";
import {
  StatusNeg,
  Finalidade,
  AtividadeTipo,
  TipoHistorico,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { finalidade?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, donoId: true, donoPosVendaId: true },
  });
  if (!lead) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }

  // Finalidade: corpo explicito ou inferida do negocio aberto do lead.
  let finalidade: Finalidade;
  if (
    body?.finalidade === Finalidade.VENDA ||
    body?.finalidade === Finalidade.POS_VENDA
  ) {
    finalidade = body.finalidade;
  } else {
    const negAberto = await prisma.negocio.findFirst({
      where: { leadId: id, status: StatusNeg.ABERTO },
      orderBy: { criadoEm: "desc" },
      select: { finalidade: true },
    });
    finalidade =
      negAberto?.finalidade ??
      (lead.donoPosVendaId && !lead.donoId
        ? Finalidade.POS_VENDA
        : Finalidade.VENDA);
  }
  const campo = campoDono(finalidade);

  // Quem assume precisa ter acesso aquela finalidade (admin pode sempre).
  if (!ehAdmin(agente.papel)) {
    const eu = await prisma.agente.findUnique({
      where: { id: agente.id },
      select: { acessoVenda: true, acessoPosVenda: true },
    });
    if (!eu || !temAcesso(eu, finalidade)) {
      return NextResponse.json(
        { erro: "sem acesso a essa finalidade" },
        { status: 403 },
      );
    }
  }

  const donoAtual = lead[campo];
  if (donoAtual && donoAtual !== agente.id && !ehAdmin(agente.papel)) {
    return NextResponse.json({ erro: "lead ja tem dono" }, { status: 403 });
  }

  const negocio = await prisma.negocio.findFirst({
    where: { leadId: id, finalidade, status: StatusNeg.ABERTO },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id },
      data:
        finalidade === Finalidade.VENDA
          ? { donoId: agente.id }
          : { donoPosVendaId: agente.id },
    });
    if (negocio) {
      await tx.negocio.update({
        where: { id: negocio.id },
        data: { agenteId: agente.id },
      });
      await tx.historicoNegocio.create({
        data: {
          negocioId: negocio.id,
          agenteId: agente.id,
          tipo: TipoHistorico.ATRIBUICAO,
          descricao: `Assumido por ${agente.nome ?? "agente"}`,
        },
      });
    }
    await espelharDonoNasConversas(tx, id, finalidade, agente.id);
    await tx.atividade.create({
      data: {
        leadId: id,
        negocioId: negocio?.id ?? null,
        agenteId: agente.id,
        tipo: AtividadeTipo.ASSUMIDO,
        descricao: `Cliente assumido por ${agente.nome ?? "agente"}`,
      },
    });
  });

  if (negocio) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: negocio.id,
      etapaId: null,
      motivo: "assumido",
    });
  }
  getIO()?.emit("conversa:atualizada", { leadId: id, finalidade });

  return NextResponse.json({ ok: true });
}

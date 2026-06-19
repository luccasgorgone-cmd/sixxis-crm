// Transfere um cliente para outro agente NAQUELA finalidade. ADMIN cruza
// qualquer; nao-admin transfere apenas os seus e dentro da mesma equipe
// (VENDEDOR<->VENDEDOR, POS_VENDA<->POS_VENDA). Reatribui o dono da finalidade,
// o negocio aberto e espelha nas conversas. Atividade(TRANSFERENCIA).
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

  let body: { agenteId?: string; finalidade?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const destinoId = String(body?.agenteId ?? "");
  if (!destinoId) {
    return NextResponse.json({ erro: "agenteId obrigatorio" }, { status: 400 });
  }
  const finalidade =
    body?.finalidade === Finalidade.POS_VENDA
      ? Finalidade.POS_VENDA
      : Finalidade.VENDA;
  const campo = campoDono(finalidade);

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      donoId: true,
      donoPosVendaId: true,
      dono: { select: { nome: true } },
      donoPosVenda: { select: { nome: true } },
    },
  });
  if (!lead) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  // Nao-admin so transfere os proprios (daquela finalidade).
  if (!ehAdmin(agente.papel) && lead[campo] !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const destino = await prisma.agente.findUnique({
    where: { id: destinoId },
    select: {
      id: true,
      nome: true,
      ativo: true,
      acessoVenda: true,
      acessoPosVenda: true,
    },
  });
  if (!destino || !destino.ativo) {
    return NextResponse.json(
      { erro: "agente destino invalido" },
      { status: 400 },
    );
  }
  // O destino precisa ter acesso aquela finalidade (mesmo para admin: nao faz
  // sentido cair em quem nao atende aquela fila).
  if (!temAcesso(destino, finalidade)) {
    return NextResponse.json(
      { erro: "destino sem acesso a essa finalidade" },
      { status: 403 },
    );
  }

  const negocio = await prisma.negocio.findFirst({
    where: { leadId: id, finalidade, status: StatusNeg.ABERTO },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });

  const de =
    (finalidade === Finalidade.VENDA
      ? lead.dono?.nome
      : lead.donoPosVenda?.nome) ?? "sem dono";
  const descricao = `Transferido de ${de} para ${destino.nome}`;

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id },
      data:
        finalidade === Finalidade.VENDA
          ? { donoId: destino.id }
          : { donoPosVendaId: destino.id },
    });
    if (negocio) {
      await tx.negocio.update({
        where: { id: negocio.id },
        data: { agenteId: destino.id },
      });
      await tx.historicoNegocio.create({
        data: {
          negocioId: negocio.id,
          agenteId: agente.id,
          tipo: TipoHistorico.ATRIBUICAO,
          descricao,
        },
      });
    }
    await espelharDonoNasConversas(tx, id, finalidade, destino.id);
    await tx.atividade.create({
      data: {
        leadId: id,
        negocioId: negocio?.id ?? null,
        agenteId: agente.id,
        tipo: AtividadeTipo.TRANSFERENCIA,
        descricao,
      },
    });
  });

  if (negocio) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: negocio.id,
      etapaId: null,
      motivo: "transferido",
    });
  }
  getIO()?.emit("conversa:atualizada", { leadId: id, finalidade });

  return NextResponse.json({ ok: true });
}

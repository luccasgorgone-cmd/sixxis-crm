// Vendedor (ou admin) assume um cliente SEM dono: vira dono do lead e do
// negocio aberto. Registra Atividade(ASSUMIDO) e historico do negocio.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import {
  StatusNeg,
  AtividadeTipo,
  TipoHistorico,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, donoId: true },
  });
  if (!lead) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  // So pode assumir lead sem dono (ou ja seu). Admin pode sempre.
  if (lead.donoId && lead.donoId !== agente.id && !ehAdmin(agente.papel)) {
    return NextResponse.json(
      { erro: "lead ja tem dono" },
      { status: 403 },
    );
  }

  const negocio = await prisma.negocio.findFirst({
    where: { leadId: id, status: StatusNeg.ABERTO },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data: { donoId: agente.id } });
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
          descricao: `Assumido por ${agente.nome ?? "vendedor"}`,
        },
      });
    }
    await tx.atividade.create({
      data: {
        leadId: id,
        negocioId: negocio?.id ?? null,
        agenteId: agente.id,
        tipo: AtividadeTipo.ASSUMIDO,
        descricao: `Cliente assumido por ${agente.nome ?? "vendedor"}`,
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

  return NextResponse.json({ ok: true });
}

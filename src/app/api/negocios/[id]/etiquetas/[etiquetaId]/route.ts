// Remove uma etiqueta do lead do negocio + historico.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { TipoHistorico, AtividadeTipo, Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; etiquetaId: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id, etiquetaId } = await ctx.params;

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      leadId: true,
      agenteId: true,
      finalidade: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  // Admin / dono do negocio / dono do cliente na finalidade. Fatia 2.86.
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const existente = await prisma.leadEtiqueta.findUnique({
    where: { leadId_etiquetaId: { leadId: negocio.leadId, etiquetaId } },
    include: { etiqueta: { select: { nome: true } } },
  });
  if (existente) {
    await prisma.$transaction([
      prisma.leadEtiqueta.delete({
        where: { leadId_etiquetaId: { leadId: negocio.leadId, etiquetaId } },
      }),
      prisma.historicoNegocio.create({
        data: {
          negocioId: negocio.id,
          agenteId: agente.id,
          tipo: TipoHistorico.ETIQUETA,
          descricao: `Etiqueta "${existente.etiqueta.nome}" removida`,
        },
      }),
      prisma.atividade.create({
        data: {
          leadId: negocio.leadId,
          negocioId: negocio.id,
          agenteId: agente.id,
          tipo: AtividadeTipo.ETIQUETA,
          descricao: `Etiqueta "${existente.etiqueta.nome}" removida`,
        },
      }),
    ]);
  }

  return NextResponse.json({ ok: true });
}

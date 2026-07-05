// Remove uma peca NECESSARIA (planejamento) de um negocio (Fatia 3.06). Delete
// fisico — e staging, nao movimenta estoque. Gate: escopo do negocio.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; pecaUsoId: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id, pecaUsoId } = await ctx.params;

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      agenteId: true,
      finalidade: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // So remove se pertencer a este negocio (staging origem NEGOCIO).
  await prisma.pecaUso.deleteMany({
    where: { id: pecaUsoId, negocioId: id, origem: "NEGOCIO" },
  });
  return NextResponse.json({ ok: true });
}

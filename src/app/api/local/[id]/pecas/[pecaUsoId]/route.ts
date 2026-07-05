// Remove uma peca APLICADA de um item da assistencia (Fatia 3.06). Na MESMA
// transacao devolve a peca ao estoque (ESTORNO). Gate: podePosVenda.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podePosVenda } from "@/lib/autorizacao";
import { movimentarPeca } from "@/lib/pecas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; pecaUsoId: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  if (!podePosVenda(agente)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id, pecaUsoId } = await ctx.params;

  const uso = await prisma.pecaUso.findFirst({
    where: { id: pecaUsoId, itemLocalId: id, origem: "LOCAL" },
    select: { id: true, pecaId: true, quantidade: true, itemLocalId: true },
  });
  if (!uso) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });

  const item = await prisma.itemLocal.findUnique({
    where: { id },
    select: { leadId: true },
  });

  // MESMA transacao: remove o uso E devolve a peca ao estoque (ESTORNO).
  await prisma.$transaction(async (tx) => {
    await tx.pecaUso.delete({ where: { id: uso.id } });
    await movimentarPeca({
      tx,
      pecaId: uso.pecaId,
      tipo: "ESTORNO",
      quantidade: uso.quantidade,
      motivo: "estorno assistencia local",
      itemLocalId: id,
      leadId: item?.leadId ?? null,
      agenteId: agente.id,
    });
  });
  return NextResponse.json({ ok: true });
}

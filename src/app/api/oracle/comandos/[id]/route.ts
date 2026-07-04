// Exclui um comando salvo do proprio agente. Exclusao FISICA (preferencia de UI
// do usuario, nao dado de negocio). 404 se nao for do agente. Fatia 2.93.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const res = await prisma.oracleComando.deleteMany({
    where: { id, agenteId: agente.id },
  });
  if (res.count === 0) {
    return NextResponse.json({ erro: "comando nao encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

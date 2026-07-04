// Arquiva (soft delete) uma conversa do Oracle do proprio agente. Nunca apaga
// fisicamente (preserva o historico). 404 se nao for do agente. Fatia 2.93.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

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
  const res = await prisma.oracleConversa.updateMany({
    where: { id, agenteId: agente.id },
    data: { arquivada: true },
  });
  if (res.count === 0) {
    return NextResponse.json({ erro: "conversa nao encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

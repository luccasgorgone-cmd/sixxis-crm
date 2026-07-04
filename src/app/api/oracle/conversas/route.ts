// Lista as conversas do Oracle do PROPRIO agente (privado — admin incluso, nao le
// conversa de outro). So nao-arquivadas, mais recentes primeiro. Fatia 2.93.
import { NextResponse } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const conversas = await prisma.oracleConversa.findMany({
    where: { agenteId: agente.id, arquivada: false },
    orderBy: { atualizadoEm: "desc" },
    take: 50,
    select: { id: true, titulo: true, atualizadoEm: true },
  });
  return NextResponse.json({ conversas });
}

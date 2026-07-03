// Figurinhas ATIVAS disponiveis para os atendentes enviarem (compositor do Inbox).
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
  const figurinhas = await prisma.figurinhaSixxis.findMany({
    where: { ativo: true },
    // Favoritas primeiro (acesso rapido), depois pela ordem.
    orderBy: [{ favorita: "desc" }, { ordem: "asc" }, { criadoEm: "asc" }],
    select: { id: true, nome: true, url: true, favorita: true },
  });
  return NextResponse.json({ figurinhas });
}

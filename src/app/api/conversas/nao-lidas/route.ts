// Total de conversas NAO LIDAS no escopo do usuario (mesmo recorte do filtro
// "Nao lidas" do inbox). Usado pelo badge da sidebar. Leve (apenas count).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const where: Prisma.ConversaWhereInput = {
    arquivada: false,
    naoLidas: { gt: 0 },
  };
  if (!ehAdmin(agente.papel)) {
    where.agenteId = agente.id;
  }
  const total = await prisma.conversa.count({ where });
  return NextResponse.json({ total });
}

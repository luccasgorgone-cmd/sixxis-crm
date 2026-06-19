// Lista vendedores ativos (VENDEDOR/POS_VENDA) para o seletor de transferencia.
// Disponivel a qualquer agente logado (diferente de /api/agentes, que e ADMIN).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { Papel } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const vendedores = await prisma.agente.findMany({
    where: { ativo: true, papel: { in: [Papel.VENDEDOR, Papel.POS_VENDA] } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  return NextResponse.json({ vendedores });
}

// Lista as etapas do funil (ordenadas). Usado pelos seletores de etapa.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const etapas = await prisma.etapa.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      nome: true,
      cor: true,
      tipo: true,
      ordem: true,
      finalidade: true,
    },
  });
  return NextResponse.json({ etapas });
}

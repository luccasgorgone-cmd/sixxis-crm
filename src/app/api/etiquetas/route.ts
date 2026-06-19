// Lista as etiquetas disponiveis (para o popover de etiquetas e filtros).
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
  const etiquetas = await prisma.etiqueta.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, cor: true },
  });
  return NextResponse.json({ etiquetas });
}

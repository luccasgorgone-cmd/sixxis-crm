// Lista as observacoes pre-definidas ativas (para o painel do cliente aplicar
// em 1 clique). Disponivel a qualquer agente logado.
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
  const observacoes = await prisma.observacaoPreset.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
    select: { id: true, texto: true },
  });
  return NextResponse.json({ observacoes });
}

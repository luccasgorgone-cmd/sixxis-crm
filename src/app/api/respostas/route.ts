// Respostas rapidas ATIVAS, para o compositor do inbox. Qualquer agente logado.
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
  const respostas = await prisma.respostaRapida.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
    select: {
      id: true,
      titulo: true,
      atalho: true,
      texto: true,
      categoria: true,
      finalidade: true,
    },
  });
  return NextResponse.json({ respostas });
}

// Lista leve dos tons ATIVOS do assistente de escrita, para a varinha do
// compositor. Acessivel a qualquer agente logado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const config = await prisma.assistenteConfig.findFirst();
  // Assistente desligado: devolve lista vazia (a varinha some no compositor).
  if (config && !config.ativo) {
    return NextResponse.json({ ativo: false, tons: [] });
  }
  const tons = await prisma.assistenteTom.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
    select: { id: true, nome: true, ordem: true },
  });
  return NextResponse.json({ ativo: true, tons });
}

// Lista os agentes ativos. Restrito a ADMIN (usado no "atribuir vendedor" e no
// filtro por vendedor do Kanban).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!ehAdmin(agente.papel)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const agentes = await prisma.agente.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, avatarUrl: true, papel: true },
  });
  return NextResponse.json({ agentes });
}

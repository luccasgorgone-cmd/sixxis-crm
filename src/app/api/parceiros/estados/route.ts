// Agregacao de parceiros por UF (para pintar o mapa). Aplica os mesmos filtros
// da lista (exceto UF, para o clique nao filtrar o proprio estado). Qualquer
// agente logado le. Isolado de Lead/Negocio/metricas.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { filtrosParceiro } from "@/lib/parceiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  // Ignora o proprio filtro de UF na pintura do mapa (mostra todos os estados).
  const sp = new URLSearchParams(req.nextUrl.searchParams);
  sp.delete("uf");
  const where = filtrosParceiro(sp);

  const grupos = await prisma.parceiro.groupBy({
    by: ["uf"],
    where,
    _count: { _all: true },
  });
  const estados = grupos
    .filter((g): g is typeof g & { uf: string } => !!g.uf)
    .map((g) => ({ uf: g.uf, total: g._count._all }));
  const max = estados.reduce((m, e) => Math.max(m, e.total), 0);
  return NextResponse.json({ estados, max });
}

// Dashboard do colaborador: metricas do PROPRIO atendimento no periodo.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { resolverPeriodo, calcularMetricas, calcularTendencia } from "@/lib/metricas";
import { StatusNeg, Papel } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const periodo = resolverPeriodo(
    sp.get("periodo"),
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );
  const escopo = { agenteId: agente.id };

  const [metricas, tendencia, agentes, sums] = await Promise.all([
    calcularMetricas(periodo, escopo),
    calcularTendencia(periodo, escopo),
    prisma.agente.findMany({
      where: { ativo: true, papel: { not: Papel.ADMIN } },
      select: { id: true },
    }),
    prisma.negocio.groupBy({
      by: ["agenteId"],
      where: {
        status: StatusNeg.GANHO,
        fechadoEm: { gte: periodo.inicio, lt: periodo.fim },
        agenteId: { not: null },
      },
      _sum: { valor: true },
    }),
  ]);

  // Ranking por valor vendido no periodo (entre colaboradores ativos).
  const mapaValor = new Map(
    sums.map((s) => [s.agenteId, Number(s._sum.valor ?? 0)]),
  );
  const rank = agentes
    .map((a) => ({ id: a.id, valor: mapaValor.get(a.id) ?? 0 }))
    .sort((x, y) => y.valor - x.valor);
  const posicao = rank.findIndex((r) => r.id === agente.id) + 1;

  return NextResponse.json({
    periodo: { inicio: periodo.inicio, fim: periodo.fim },
    metricas,
    tendencia,
    ranking: { posicao, total: agentes.length },
  });
}

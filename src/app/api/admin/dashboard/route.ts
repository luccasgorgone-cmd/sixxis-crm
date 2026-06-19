// Dashboard do admin: visao geral combinada + recorte por finalidade + tabela
// por colaborador. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import {
  resolverPeriodo,
  calcularMetricas,
  calcularTendencia,
} from "@/lib/metricas";
import { Papel, Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const periodo = resolverPeriodo(
    sp.get("periodo"),
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );

  const agentes = await prisma.agente.findMany({
    where: { ativo: true, papel: { not: Papel.ADMIN } },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      acessoVenda: true,
      acessoPosVenda: true,
    },
  });

  const [geral, venda, posVenda, tendenciaGeral, porColaborador] =
    await Promise.all([
      calcularMetricas(periodo, {}),
      calcularMetricas(periodo, { finalidade: Finalidade.VENDA }),
      calcularMetricas(periodo, { finalidade: Finalidade.POS_VENDA }),
      calcularTendencia(periodo, {}),
      Promise.all(
        agentes.map(async (a) => ({
          id: a.id,
          nome: a.nome,
          acesso:
            a.acessoVenda && a.acessoPosVenda
              ? "Ambos"
              : a.acessoVenda
                ? "Venda"
                : a.acessoPosVenda
                  ? "Pos-venda"
                  : "Nenhum",
          metricas: await calcularMetricas(periodo, { agenteId: a.id }),
        })),
      ),
    ]);

  return NextResponse.json({
    periodo: { inicio: periodo.inicio, fim: periodo.fim },
    geral,
    porFinalidade: { venda, posVenda },
    tendencia: tendenciaGeral,
    porColaborador,
  });
}

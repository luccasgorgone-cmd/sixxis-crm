// Admin: perfil de um colaborador (dados + metricas no periodo).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { resolverPeriodo, calcularMetricas } from "@/lib/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const agente = await prisma.agente.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      ativo: true,
      acessoVenda: true,
      acessoPosVenda: true,
    },
  });
  if (!agente) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const periodo = resolverPeriodo(
    sp.get("periodo"),
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );
  const metricas = await calcularMetricas(periodo, { agenteId: id });

  return NextResponse.json({
    agente: {
      ...agente,
      acesso:
        agente.acessoVenda && agente.acessoPosVenda
          ? "Ambos"
          : agente.acessoVenda
            ? "Venda"
            : agente.acessoPosVenda
              ? "Pos-venda"
              : "Nenhum",
    },
    periodo: { inicio: periodo.inicio, fim: periodo.fim },
    metricas,
  });
}

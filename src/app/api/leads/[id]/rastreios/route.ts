// Rastreios de TODOS os negocios de um cliente (Fatia D). READ-ONLY. Nivel lead:
// o painel mostra os rastreios do negocio atual (editaveis) e, abaixo, os dos
// DEMAIS negocios do lead (somente leitura), identificando o PED/negocio de origem.
// Gate: dono do cliente (venda/pos), dono da conversa ou admin (podeGerenciarLead).
// Sem N+1: 3 queries em lote (negocios, rastreios, orcamentos para o rotulo PED).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeGerenciarLead } from "@/lib/autorizacao";
import { formatarNumeroPedido } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await podeGerenciarLead(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const negocios = await prisma.negocio.findMany({
    where: { leadId: id },
    select: { id: true, finalidade: true },
  });
  const negocioIds = negocios.map((n) => n.id);
  if (negocioIds.length === 0) {
    return NextResponse.json({ rastreios: [] });
  }
  const finalidadePorNegocio = new Map(negocios.map((n) => [n.id, n.finalidade]));

  const [rastreios, orcs] = await Promise.all([
    prisma.rastreioNegocio.findMany({
      where: { negocioId: { in: negocioIds } },
      orderBy: { criadoEm: "desc" },
      select: {
        id: true,
        codigo: true,
        transportadora: true,
        negocioId: true,
        criadoEm: true,
      },
    }),
    prisma.orcamento.findMany({
      where: { negocioId: { in: negocioIds } },
      orderBy: { criadoEm: "desc" },
      select: { negocioId: true, numero: true },
    }),
  ]);

  // PED de origem: o orcamento mais recente do negocio (o findMany ja vem desc).
  const pedPorNegocio = new Map<string, number>();
  for (const o of orcs) {
    if (o.negocioId && !pedPorNegocio.has(o.negocioId)) {
      pedPorNegocio.set(o.negocioId, o.numero);
    }
  }

  return NextResponse.json({
    rastreios: rastreios.map((r) => {
      const ped = pedPorNegocio.get(r.negocioId);
      const finalidade = finalidadePorNegocio.get(r.negocioId);
      return {
        id: r.id,
        codigo: r.codigo,
        transportadora: r.transportadora,
        negocioId: r.negocioId,
        // Rotulo de origem: PED do orcamento mais recente, senao a finalidade.
        origemLabel: ped
          ? formatarNumeroPedido(ped)
          : finalidade === "POS_VENDA"
            ? "Pos-venda"
            : "Venda",
        criadoEm: r.criadoEm,
      };
    }),
  });
}

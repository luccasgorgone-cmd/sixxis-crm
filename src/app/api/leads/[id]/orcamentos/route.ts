// Historico de ORCAMENTOS-decisao de um cliente (Fatia 3.07): cada decisao
// (Ganho/Pendente/Perdido) com itens gera um orcamento numerado. Escopo dono/admin
// (escopoLeadWhere). Ate 50, mais recentes primeiro. Itens vao no detalhe.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { formatarNumeroPedido } from "@/lib/format";
import { lerPagamentos } from "@/lib/pagamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  // ESCOPO: so acessa o lead se estiver no escopo do usuario.
  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id }, escopoLeadWhere(agente, new URLSearchParams())] },
    select: { id: true },
  });
  if (!lead) {
    return NextResponse.json(
      { erro: "cliente nao encontrado no seu escopo" },
      { status: 404 },
    );
  }

  // Fatia C: a situacao de pagamento vem da COBRANCA VINCULADA ao orcamento
  // (Pagamento.orcamentoId, criado na decisao — Fatia A). include/join da relacao
  // `cobrancas` => 2 queries no total (orcamentos + cobrancas em lote), SEM N+1.
  const orcamentos = await prisma.orcamento.findMany({
    where: { leadId: id },
    orderBy: { criadoEm: "desc" },
    take: 50,
    select: {
      id: true,
      numero: true,
      negocioId: true,
      finalidade: true,
      decisao: true,
      total: true,
      totalGarantia: true,
      pagamentos: true,
      criadoEm: true,
      itens: {
        select: {
          id: true,
          descricao: true,
          quantidade: true,
          valorUnitario: true,
          garantia: true,
        },
      },
      cobrancas: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { status: true, valor: true, pagoEm: true },
      },
      // NF mais antiga vinculada (base da garantia derivada, Fatia F).
      notasFiscais: {
        orderBy: { dataNF: "asc" },
        take: 1,
        select: { dataNF: true },
      },
    },
  });

  return NextResponse.json({
    orcamentos: orcamentos.map((o) => {
      const cob = o.cobrancas[0] ?? null;
      const pagamento = cob
        ? { status: cob.status, valor: Number(cob.valor), pagoEm: cob.pagoEm }
        : null;
      return {
        id: o.id,
        numero: o.numero,
        numeroFormatado: formatarNumeroPedido(o.numero),
        finalidade: o.finalidade,
        decisao: o.decisao,
        total: Number(o.total),
        totalGarantia: o.totalGarantia != null ? Number(o.totalGarantia) : null,
        pagamentos: lerPagamentos(o.pagamentos),
        // Situacao de pagamento POR ORCAMENTO (cobranca vinculada) ou null.
        pagamento,
        // Compat: campos planos ainda consumidos pela UI atual.
        statusPagamento: pagamento?.status ?? null,
        pagamentoPagoEm: pagamento?.pagoEm ?? null,
        // Data da NF mais antiga vinculada (base da garantia, Fatia F) ou null.
        dataNFGarantia: o.notasFiscais[0]?.dataNF ?? null,
        qtdItens: o.itens.length,
        criadoEm: o.criadoEm,
        itens: o.itens.map((it) => ({
          id: it.id,
          descricao: it.descricao,
          quantidade: it.quantidade,
          valorUnitario: Number(it.valorUnitario),
          garantia: it.garantia,
        })),
      };
    }),
  });
}

// Pedidos de um cliente (Fatia E): PEDIDO = ORCAMENTO com decisao GANHO (imutavel,
// numerado PED-000000). Retorna numero, data, totalFinal, finalidade, itens, NFs
// vinculadas (NotaFiscal.orcamentoId), rastreios do negocio de origem e a situacao
// de pagamento (cobranca vinculada, Pagamento.orcamentoId). Alimenta a secao
// "Pedidos" e o "repetir pedido". Escopo: so leads que o usuario pode ver.
// Sem N+1: orcamentos com includes (itens/NFs/cobrancas em lote) + 1 query de
// rastreios por negocioId em lote.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { formatarNumeroPedido } from "@/lib/format";

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
    return NextResponse.json({ erro: "cliente nao encontrado no seu escopo" }, { status: 404 });
  }

  const orcamentos = await prisma.orcamento.findMany({
    where: { leadId: id, decisao: "GANHO" },
    orderBy: { criadoEm: "desc" },
    take: 50,
    select: {
      id: true,
      numero: true,
      negocioId: true,
      finalidade: true,
      total: true,
      totalFinal: true,
      frete: true,
      fretePagoPelaEmpresa: true,
      criadoEm: true,
      itens: {
        select: {
          produtoCatalogoId: true,
          descricao: true,
          quantidade: true,
          valorUnitario: true,
          garantia: true,
        },
      },
      notasFiscais: {
        orderBy: { dataNF: "desc" },
        select: { id: true, numero: true, dataNF: true },
      },
      cobrancas: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { status: true, valor: true, pagoEm: true },
      },
    },
  });

  // Rastreios do negocio de origem (em lote, sem N+1).
  const negocioIds = [...new Set(orcamentos.map((o) => o.negocioId))];
  const rastreios = negocioIds.length
    ? await prisma.rastreioNegocio.findMany({
        where: { negocioId: { in: negocioIds } },
        orderBy: { criadoEm: "desc" },
        select: { id: true, codigo: true, transportadora: true, negocioId: true },
      })
    : [];
  const rastPorNegocio = new Map<
    string,
    { id: string; codigo: string; transportadora: string | null }[]
  >();
  for (const r of rastreios) {
    const arr = rastPorNegocio.get(r.negocioId) ?? [];
    arr.push({ id: r.id, codigo: r.codigo, transportadora: r.transportadora });
    rastPorNegocio.set(r.negocioId, arr);
  }

  return NextResponse.json({
    pedidos: orcamentos.map((o) => {
      const cob = o.cobrancas[0] ?? null;
      return {
        id: o.id,
        negocioId: o.negocioId,
        numero: o.numero,
        numeroFormatado: formatarNumeroPedido(o.numero),
        finalidade: o.finalidade,
        data: o.criadoEm,
        total: Number(o.totalFinal),
        totalBruto: Number(o.total),
        frete: o.frete != null ? Number(o.frete) : null,
        fretePagoPelaEmpresa: o.fretePagoPelaEmpresa,
        itens: o.itens.map((it) => ({
          produtoCatalogoId: it.produtoCatalogoId,
          descricao: it.descricao,
          quantidade: it.quantidade,
          valorUnitario: Number(it.valorUnitario),
          garantia: it.garantia,
          subtotal: it.quantidade * Number(it.valorUnitario),
        })),
        notasFiscais: o.notasFiscais.map((n) => ({
          id: n.id,
          numero: n.numero,
          dataNF: n.dataNF,
        })),
        rastreios: rastPorNegocio.get(o.negocioId) ?? [],
        pagamento: cob
          ? { status: cob.status, valor: Number(cob.valor), pagoEm: cob.pagoEm }
          : null,
      };
    }),
  });
}

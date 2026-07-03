// Pedidos (negocios GANHOS) de um cliente: itens, quantidades, valores, frete,
// total e data — venda e pecas. Para a secao "Pedidos" da ficha e o "repetir
// pedido". Escopo: o usuario so ve pedidos de leads que pode ver.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { StatusNeg } from "@/generated/prisma/enums";

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

  const negocios = await prisma.negocio.findMany({
    where: { leadId: id, status: StatusNeg.GANHO },
    orderBy: [{ fechadoEm: "desc" }, { atualizadoEm: "desc" }],
    take: 50,
    select: {
      id: true,
      finalidade: true,
      valor: true,
      valorProdutos: true,
      frete: true,
      fechadoEm: true,
      itensPedido: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true,
          produtoCatalogoId: true,
          descricao: true,
          quantidade: true,
          valorUnitario: true,
          subtotal: true,
        },
      },
    },
  });

  const num = (v: unknown) => (v != null ? Number(v) : null);
  return NextResponse.json({
    pedidos: negocios.map((n) => ({
      negocioId: n.id,
      finalidade: n.finalidade,
      data: n.fechadoEm,
      total: num(n.valor),
      valorProdutos: num(n.valorProdutos),
      frete: num(n.frete),
      itens: n.itensPedido.map((it) => ({
        produtoCatalogoId: it.produtoCatalogoId,
        descricao: it.descricao,
        quantidade: it.quantidade,
        valorUnitario: Number(it.valorUnitario),
        subtotal: Number(it.subtotal),
      })),
    })),
  });
}

// Pecas do cliente (Fatia 3.02): itens de pedidos PoS-VENDA (ganhos) do lead —
// para a secao "Pecas do cliente" no atendimento. Escopo padrao: o usuario so ve
// leads do seu escopo (dono/admin). Ate 30 itens, mais recentes primeiro.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { Finalidade, StatusNeg } from "@/generated/prisma/enums";

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

  const itens = await prisma.itemPedido.findMany({
    where: {
      negocio: {
        leadId: id,
        finalidade: Finalidade.POS_VENDA,
        status: StatusNeg.GANHO,
      },
    },
    orderBy: { criadoEm: "desc" },
    take: 30,
    select: {
      id: true,
      negocioId: true,
      descricao: true,
      quantidade: true,
      valorUnitario: true,
      subtotal: true,
      garantia: true,
      criadoEm: true,
      negocio: { select: { fechadoEm: true } },
    },
  });

  return NextResponse.json({
    pecas: itens.map((it) => ({
      id: it.id,
      negocioId: it.negocioId,
      descricao: it.descricao,
      quantidade: it.quantidade,
      valorUnitario: Number(it.valorUnitario),
      subtotal: Number(it.subtotal),
      garantia: it.garantia,
      data: it.negocio?.fechadoEm ?? it.criadoEm,
    })),
  });
}

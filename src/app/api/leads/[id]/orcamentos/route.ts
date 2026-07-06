// Historico de ORCAMENTOS-decisao de um cliente (Fatia 3.07): cada decisao
// (Ganho/Pendente/Perdido) com itens gera um orcamento numerado. Escopo dono/admin
// (escopoLeadWhere). Ate 50, mais recentes primeiro. Itens vao no detalhe.
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
    return NextResponse.json(
      { erro: "cliente nao encontrado no seu escopo" },
      { status: 404 },
    );
  }

  const orcamentos = await prisma.orcamento.findMany({
    where: { leadId: id },
    orderBy: { criadoEm: "desc" },
    take: 50,
    select: {
      id: true,
      numero: true,
      finalidade: true,
      decisao: true,
      total: true,
      totalGarantia: true,
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
    },
  });

  return NextResponse.json({
    orcamentos: orcamentos.map((o) => ({
      id: o.id,
      numero: o.numero,
      numeroFormatado: formatarNumeroPedido(o.numero),
      finalidade: o.finalidade,
      decisao: o.decisao,
      total: Number(o.total),
      totalGarantia: o.totalGarantia != null ? Number(o.totalGarantia) : null,
      qtdItens: o.itens.length,
      criadoEm: o.criadoEm,
      itens: o.itens.map((it) => ({
        id: it.id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        valorUnitario: Number(it.valorUnitario),
        garantia: it.garantia,
      })),
    })),
  });
}

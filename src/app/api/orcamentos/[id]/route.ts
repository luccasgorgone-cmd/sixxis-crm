// Ficha completa de um ORCAMENTO (Fatia 3.09) para o drawer da aba. Escopo:
// admin ou orcamento de um lead do usuario (escopoLeadWhere). Inclui itens,
// cliente (contato/CPF/CNPJ/cidade-UF), negocio (finalidade/etapa/dono) e valores.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { formatarNumeroPedido, formatarTelefone } from "@/lib/format";
import { nomeEfetivo } from "@/lib/cliente";

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

  const o = await prisma.orcamento.findFirst({
    where: { AND: [{ id }, { lead: escopoLeadWhere(agente, new URLSearchParams()) }] },
    select: {
      id: true,
      numero: true,
      finalidade: true,
      decisao: true,
      total: true,
      totalGarantia: true,
      cupom: true,
      descontoPct: true,
      frete: true,
      fretePagoPelaEmpresa: true,
      totalFinal: true,
      agenteId: true,
      negocioId: true,
      criadoEm: true,
      lead: {
        select: {
          id: true,
          nome: true,
          nomeManual: true,
          pushName: true,
          telefone: true,
          cpf: true,
          cnpj: true,
          enderecos: {
            orderBy: { principal: "desc" },
            take: 1,
            select: { cidade: true, uf: true },
          },
        },
      },
    },
  });
  if (!o) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }

  const itens = await prisma.orcamentoItem.findMany({
    where: { orcamentoId: o.id },
    select: { id: true, descricao: true, quantidade: true, valorUnitario: true, garantia: true },
  });

  // Contexto do negocio (finalidade/etapa/dono) + valorAjustado consolidado.
  const negocio = await prisma.negocio.findUnique({
    where: { id: o.negocioId },
    select: {
      valor: true,
      valorAjustado: true,
      etapa: { select: { nome: true } },
      agente: { select: { nome: true } },
    },
  });
  const nomeAgente = o.agenteId
    ? (await prisma.agente.findUnique({ where: { id: o.agenteId }, select: { nome: true } }))?.nome ?? null
    : null;

  const num = (v: unknown) => (v != null ? Number(v) : null);
  const end = o.lead.enderecos[0];

  return NextResponse.json({
    orcamento: {
      id: o.id,
      numero: o.numero,
      numeroFormatado: formatarNumeroPedido(o.numero),
      finalidade: o.finalidade,
      decisao: o.decisao,
      criadoEm: o.criadoEm,
      negocioId: o.negocioId,
      cliente: {
        leadId: o.lead.id,
        nome: nomeEfetivo(o.lead),
        telefone: formatarTelefone(o.lead.telefone),
        cpf: o.lead.cpf,
        cnpj: o.lead.cnpj,
        cidade: end?.cidade ?? null,
        uf: end?.uf ?? null,
      },
      contexto: {
        finalidade: o.finalidade,
        etapa: negocio?.etapa?.nome ?? null,
        dono: negocio?.agente?.nome ?? nomeAgente,
      },
      valores: {
        subtotal: num(o.total),
        cupom: o.cupom,
        descontoPct: num(o.descontoPct),
        frete: num(o.frete),
        fretePagoPelaEmpresa: o.fretePagoPelaEmpresa,
        totalFinal: num(o.totalFinal),
        totalGarantia: num(o.totalGarantia),
        // No GANHO, o valor realmente consolidado no negocio.
        valorNegocio:
          o.decisao === "GANHO"
            ? (negocio?.valorAjustado != null ? num(negocio.valorAjustado) : num(negocio?.valor))
            : null,
      },
      itens: itens.map((it) => ({
        id: it.id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        valorUnitario: Number(it.valorUnitario),
        subtotal: it.quantidade * Number(it.valorUnitario),
        garantia: it.garantia,
      })),
    },
  });
}

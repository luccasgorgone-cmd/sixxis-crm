// Pecas NECESSARIAS (planejadas) de um negocio de pos-venda (Fatia 3.06).
// Staging: NAO movimenta estoque — vira ItemPedido (e baixa) no fechamento.
// Gate: mesmo escopo do negocio (dono do negocio / dono do cliente / admin).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { Finalidade, TipoCatalogo } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Carrega o negocio e verifica o acesso de ESCRITA (dono do negocio / dono do
// cliente na finalidade / admin) — mesmo criterio do PATCH /api/negocios/[id].
async function negocioComAcesso(agenteId: string, negocioId: string) {
  const negocio = await prisma.negocio.findUnique({
    where: { id: negocioId },
    select: {
      id: true,
      agenteId: true,
      finalidade: true,
      leadId: true,
      modeloProdutoCliente: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  return negocio;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const negocio = await negocioComAcesso(agente.id, id);
  if (!negocio) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const usos = await prisma.pecaUso.findMany({
    where: { negocioId: id, origem: "NEGOCIO" },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      quantidade: true,
      garantia: true,
      peca: {
        select: {
          id: true,
          nome: true,
          modelo: true,
          precoSugerido: true,
          estoque: true,
        },
      },
    },
  });
  return NextResponse.json({
    pecas: usos.map(serializarUso),
    modeloProdutoCliente: negocio.modeloProdutoCliente,
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const negocio = await negocioComAcesso(agente.id, id);
  if (!negocio) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const pecaId = typeof body.pecaId === "string" ? body.pecaId : "";
  const quantidade = Math.round(Number(body.quantidade));
  if (!pecaId || !Number.isFinite(quantidade) || quantidade < 1 || quantidade > 99) {
    return NextResponse.json({ erro: "peca/quantidade invalida" }, { status: 400 });
  }
  const peca = await prisma.produtoCatalogo.findUnique({
    where: { id: pecaId },
    select: { id: true, tipo: true, ativo: true },
  });
  // Tipo do item pela finalidade: POS_VENDA aceita PECA; VENDA aceita PRODUTO.
  const tipoEsperado =
    negocio.finalidade === Finalidade.POS_VENDA
      ? TipoCatalogo.PECA
      : TipoCatalogo.PRODUTO;
  if (!peca || !peca.ativo) {
    return NextResponse.json({ erro: "item invalido" }, { status: 400 });
  }
  if (peca.tipo !== tipoEsperado) {
    return NextResponse.json(
      {
        erro:
          tipoEsperado === TipoCatalogo.PECA
            ? "neste atendimento de pos-venda so entram pecas"
            : "nesta venda so entram produtos",
      },
      { status: 400 },
    );
  }

  const uso = await prisma.pecaUso.create({
    data: {
      origem: "NEGOCIO",
      negocioId: id,
      pecaId,
      quantidade,
      garantia: body.garantia === true,
      agenteId: agente.id,
    },
    select: {
      id: true,
      quantidade: true,
      garantia: true,
      peca: {
        select: { id: true, nome: true, modelo: true, precoSugerido: true, estoque: true },
      },
    },
  });
  return NextResponse.json({ peca: serializarUso(uso) });
}

type UsoRow = {
  id: string;
  quantidade: number;
  garantia: boolean;
  peca: {
    id: string;
    nome: string;
    modelo: string | null;
    precoSugerido: unknown;
    estoque: number;
  };
};

export function serializarUso(u: UsoRow) {
  return {
    id: u.id,
    quantidade: u.quantidade,
    garantia: u.garantia,
    pecaId: u.peca.id,
    nome: u.peca.nome,
    modelo: u.peca.modelo,
    precoSugerido: u.peca.precoSugerido != null ? Number(u.peca.precoSugerido) : null,
    estoque: u.peca.estoque,
  };
}

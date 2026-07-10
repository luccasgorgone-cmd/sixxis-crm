// Pecas NECESSARIAS (planejadas) de um negocio de pos-venda (Fatia 3.06).
// Staging: NAO movimenta estoque — vira ItemPedido (e baixa) no fechamento.
// Gate: mesmo escopo do negocio (dono do negocio / dono do cliente / admin).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { Finalidade, TipoCatalogo } from "@/generated/prisma/enums";
import { lerPagamentos } from "@/lib/pagamento";

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
      orcCupom: true,
      orcDescontoPct: true,
      orcFrete: true,
      orcFretePagoPelaEmpresa: true,
      orcFreteTransportadora: true,
      orcPagamentos: true,
      lead: {
        select: {
          donoId: true,
          donoPosVendaId: true,
          // Endereco principal para pre-preencher o CEP do frete (Fase 2).
          enderecos: {
            orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
            take: 1,
            select: { cep: true },
          },
        },
      },
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
          voltagem: true,
          precoSugerido: true,
          estoque: true,
        },
      },
    },
  });
  return NextResponse.json({
    pecas: usos.map(serializarUso),
    modeloProdutoCliente: negocio.modeloProdutoCliente,
    // Rascunho do orcamento (Fatia 3.09).
    orc: {
      cupom: negocio.orcCupom,
      descontoPct: negocio.orcDescontoPct != null ? Number(negocio.orcDescontoPct) : null,
      frete: negocio.orcFrete != null ? Number(negocio.orcFrete) : null,
      fretePagoPelaEmpresa: negocio.orcFretePagoPelaEmpresa,
      freteTransportadora: negocio.orcFreteTransportadora,
    },
    // CEP do endereco principal do lead (pre-preenche o campo de frete). Fase 2.
    cepDestino: negocio.lead.enderecos[0]?.cep ?? null,
    // Formas de pagamento do rascunho (Fatia 3.18): array validado.
    pagamentos: lerPagamentos(negocio.orcPagamentos),
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
  let pecaId = typeof body.pecaId === "string" ? body.pecaId : "";
  const quantidade = Math.round(Number(body.quantidade));
  if (!Number.isFinite(quantidade) || quantidade < 1 || quantidade > 99) {
    return NextResponse.json({ erro: "quantidade invalida" }, { status: 400 });
  }

  // LAZY-SYNC loja->catalogo (Fatia 3.09): produto do SITE na VENDA. Ao adicionar,
  // fazemos upsert no ProdutoCatalogo por (tipo=PRODUTO, chaveLoja=slug) com o
  // preco ATUAL do site (promocional se houver) e usamos o id resultante como
  // pecaId. O staging/Orcamento sempre referencia o catalogo; o snapshot na
  // decisao congela o preco. Produto nao movimenta estoque.
  const loja = body.produtoLoja as
    | { slug?: string; nome?: string; categoria?: string; preco?: number; precoPromo?: number | null }
    | undefined;
  if (
    !pecaId &&
    negocio.finalidade === Finalidade.VENDA &&
    loja &&
    typeof loja.slug === "string" &&
    loja.slug.trim() &&
    typeof loja.nome === "string" &&
    loja.nome.trim()
  ) {
    const precoAtual =
      loja.precoPromo != null && loja.precoPromo > 0
        ? loja.precoPromo
        : Number(loja.preco) || 0;
    const slug = loja.slug.trim();
    const nome = loja.nome.trim();
    const categoria = loja.categoria?.trim() || null;
    const existente = await prisma.produtoCatalogo.findFirst({
      where: { tipo: TipoCatalogo.PRODUTO, chaveLoja: slug },
      select: { id: true },
    });
    if (existente) {
      await prisma.produtoCatalogo.update({
        where: { id: existente.id },
        data: { nome, categoria, precoSugerido: precoAtual, ativo: true },
      });
      pecaId = existente.id;
    } else {
      const ultima = await prisma.produtoCatalogo.findFirst({
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });
      const novo = await prisma.produtoCatalogo.create({
        data: {
          nome,
          categoria,
          precoSugerido: precoAtual,
          tipo: TipoCatalogo.PRODUTO,
          chaveLoja: slug,
          ordem: (ultima?.ordem ?? 0) + 1,
        },
        select: { id: true },
      });
      pecaId = novo.id;
    }
  }

  if (!pecaId) {
    return NextResponse.json({ erro: "item invalido" }, { status: 400 });
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
            ? "Neste atendimento de pós-venda só entram peças."
            : "Nesta venda só entram produtos.",
      },
      { status: 400 },
    );
  }

  const garantia = body.garantia === true;
  const selectUso = {
    id: true,
    quantidade: true,
    garantia: true,
    peca: {
      select: {
        id: true,
        nome: true,
        modelo: true,
        voltagem: true,
        precoSugerido: true,
        estoque: true,
      },
    },
  } as const;

  // MERGE (Fatia 3.16): adicionar o MESMO item (mesmo pecaId E mesmo estado de
  // garantia) SOMA na quantidade em vez de duplicar a linha. Itens iguais com
  // garantia DIFERENTE ficam SEPARADOS — cobravel e cortesia sao coisas distintas
  // no orcamento. Teto de 99: se a soma passar, limita a 99 e sinaliza (limitado).
  const existente = await prisma.pecaUso.findFirst({
    where: { negocioId: id, origem: "NEGOCIO", pecaId, garantia },
    select: { id: true, quantidade: true },
  });

  let uso;
  let limitado = false;
  if (existente) {
    const somada = existente.quantidade + quantidade;
    limitado = somada > 99;
    uso = await prisma.pecaUso.update({
      where: { id: existente.id },
      data: { quantidade: Math.min(99, somada) },
      select: selectUso,
    });
  } else {
    uso = await prisma.pecaUso.create({
      data: { origem: "NEGOCIO", negocioId: id, pecaId, quantidade, garantia, agenteId: agente.id },
      select: selectUso,
    });
  }
  return NextResponse.json({ peca: serializarUso(uso), ...(limitado ? { limitado: true } : {}) });
}

type UsoRow = {
  id: string;
  quantidade: number;
  garantia: boolean;
  peca: {
    id: string;
    nome: string;
    modelo: string | null;
    voltagem: string | null;
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
    voltagem: u.peca.voltagem,
    precoSugerido: u.peca.precoSugerido != null ? Number(u.peca.precoSugerido) : null,
    estoque: u.peca.estoque,
  };
}

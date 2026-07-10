// Cotacao de frete do atendimento (Fase 2 — Bloco 2). Monta o body a partir do
// negocio (itens do staging OU dimensoes da caixa) + CEP do destino e chama a Loja
// via freteLoja.cotarFrete. Retorna as cotacoes POR TRANSPORTADORA ao front (o
// atendente escolhe). Escopo: dono do negocio / dono do cliente na finalidade /
// admin — mesmo criterio do PATCH e do pecas-necessarias.
//
// TRAVA: frete NUNCA quebra o orcamento. Toda ausencia (sem CEP, sem itens, loja
// off) vira { ok:false, mensagem } com HTTP 200 — o front cai no frete manual.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";
import { cotarFrete, type ItemFreteLoja } from "@/lib/freteLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      agenteId: true,
      finalidade: true,
      leadId: true,
      lead: {
        select: {
          donoId: true,
          donoPosVendaId: true,
          // Endereco principal (mesma ordenacao do orcamentoDados): principal
          // primeiro, depois o mais antigo. Traz CEP/UF do destino.
          enderecos: {
            orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
            take: 1,
            select: { cep: true, uf: true, cidade: true },
          },
        },
      },
    },
  });
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
    body = {};
  }

  // CEP: o informado no bloco de frete tem prioridade; senao o do endereco do lead.
  const endereco = negocio.lead.enderecos[0] ?? null;
  const cepInformado =
    typeof body.cep === "string" ? body.cep.replace(/\D/g, "") : "";
  const cepEndereco = endereco?.cep ? String(endereco.cep).replace(/\D/g, "") : "";
  const cepDestino = cepInformado.length === 8 ? cepInformado : cepEndereco;

  if (cepDestino.length !== 8) {
    // Sem CEP nao ha como cotar — pede o CEP SEM quebrar o fluxo (frete manual).
    return NextResponse.json({
      ok: false,
      precisaCep: true,
      mensagem: "Informe o CEP de destino para cotar o frete.",
    });
  }

  const uf = endereco?.uf ? String(endereco.uf).trim().toUpperCase() : undefined;

  // ---- Monta os itens conforme a finalidade ----
  let itens: ItemFreteLoja[];

  if (negocio.finalidade === Finalidade.POS_VENDA) {
    // POS_VENDA: dimensoes CRUAS da caixa informadas pelo atendente (1 item).
    const d = (body.dimensoes ?? {}) as Record<string, unknown>;
    const pesoKg = Number(d.pesoKg);
    const alturaCm = Number(d.alturaCm);
    const larguraCm = Number(d.larguraCm);
    const comprimentoCm = Number(d.comprimentoCm);
    const validos =
      [pesoKg, alturaCm, larguraCm, comprimentoCm].every(
        (n) => Number.isFinite(n) && n > 0,
      );
    if (!validos) {
      return NextResponse.json({
        ok: false,
        mensagem: "Informe peso e dimensões (altura, largura, comprimento) da caixa.",
      });
    }
    itens = [{ dimensoes: { pesoKg, alturaCm, larguraCm, comprimentoCm }, quantidade: 1 }];
  } else {
    // VENDA: itens por produto. O staging (PecaUso) referencia ProdutoCatalogo
    // tipo=PRODUTO cuja chaveLoja E o slug do site — a Loja reconhece por slug.
    const usos = await prisma.pecaUso.findMany({
      where: { negocioId: id, origem: "NEGOCIO" },
      select: {
        quantidade: true,
        peca: { select: { chaveLoja: true } },
      },
    });
    const porSlug = new Map<string, number>();
    for (const u of usos) {
      const slug = u.peca.chaveLoja?.trim();
      if (!slug) continue; // item manual (sem vinculo com o site) nao cota
      porSlug.set(slug, (porSlug.get(slug) ?? 0) + u.quantidade);
    }
    itens = [...porSlug.entries()].map(([slug, quantidade]) => ({ slug, quantidade }));

    if (itens.length === 0) {
      return NextResponse.json({
        ok: false,
        mensagem:
          "Nenhum produto do site no orçamento para cotar. Use o frete manual.",
      });
    }
  }

  const resultado = await cotarFrete({ cepDestino, uf, itens });
  // Repassa o resultado da Loja ao front (cotacoes por transportadora + maisBarata).
  // Anexa o CEP/UF efetivamente usados para a UI exibir/confirmar.
  return NextResponse.json({ ...resultado, cepDestino, uf: resultado.uf ?? uf ?? null });
}

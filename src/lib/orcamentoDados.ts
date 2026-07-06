// Monta os DADOS do PDF do orcamento (Fatia 3.13) a partir do STAGING atual do
// negocio (pecas necessarias) + cupom/desconto/frete + cliente do lead. Server-only
// (Prisma). Reusado pelo endpoint que so gera o PDF e pelo que gera+envia.
import { prisma } from "@/lib/prisma";
import { calcularTotalFinal, formatarNumeroPedido, formatarTelefone } from "@/lib/format";
import { nomeEfetivo } from "@/lib/cliente";
import { podeAcessarNegocio, type SessaoAgente } from "@/lib/autorizacao";
import type { DadosPdfOrcamento, LogoEmbed } from "@/lib/orcamentoPdf";
import { Finalidade } from "@/generated/prisma/enums";

// Acesso de ESCRITA ao negocio (dono negocio / dono cliente na finalidade /
// admin) — mesmo criterio do PATCH /api/negocios/[id] e do staging de pecas.
// Compartilhado pelos endpoints de PDF (gerar) e de envio do orcamento.
export async function checarAcessoNegocio(
  agente: SessaoAgente,
  negocioId: string,
): Promise<{ ok: true } | { ok: false; status: number; erro: string }> {
  const negocio = await prisma.negocio.findUnique({
    where: { id: negocioId },
    select: {
      agenteId: true,
      finalidade: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) return { ok: false, status: 404, erro: "nao encontrado" };
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return { ok: false, status: 403, erro: "sem permissao" };
  }
  return { ok: true };
}

export type MontagemOrcamento = {
  dados: DadosPdfOrcamento;
  leadId: string;
  finalidade: Finalidade;
  telefone: string;
  nomeCliente: string;
  numeroFormatado: string;
  temItens: boolean;
  // Logo da marca (mesma fonte do /api/logo) pronta para embutir no PDF. null
  // quando nao ha logo OU o formato nao e PNG/JPEG (webp/svg -> wordmark textual).
  logo: LogoEmbed | null;
};

// Le a logo do ConfiguracaoCRM e a converte em bytes embutiveis. PNG/JPEG embutem
// direto; WEBP e convertido para PNG no gerador (sharp). SVG segue sem suporte ->
// null (o gerador cai no wordmark). Nunca lanca (falha -> null, PDF com "Sixxis").
async function carregarLogoEmbed(): Promise<LogoEmbed | null> {
  try {
    const cfg = await prisma.configuracaoCRM.findFirst({
      select: { logoData: true, logoMime: true },
    });
    if (!cfg?.logoData || !cfg.logoData.startsWith("data:")) return null;
    const mime = (cfg.logoMime ?? "").toLowerCase();
    const formato: "png" | "jpg" | "webp" | null = mime.includes("png")
      ? "png"
      : mime.includes("jpeg") || mime.includes("jpg")
        ? "jpg"
        : mime.includes("webp")
          ? "webp"
          : null;
    if (!formato) return null; // svg/outros: fallback textual
    const b64 = cfg.logoData.split(",")[1] ?? "";
    const bytes = Buffer.from(b64, "base64");
    return bytes.length > 0 ? { bytes, formato } : null;
  } catch {
    return null;
  }
}

function dataBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Retorna a montagem completa ou null quando o negocio nao existe. `temItens`
// indica se o staging tem itens (o chamador decide se bloqueia o envio).
export async function montarDadosPdfOrcamento(
  negocioId: string,
): Promise<MontagemOrcamento | null> {
  const negocio = await prisma.negocio.findUnique({
    where: { id: negocioId },
    select: {
      finalidade: true,
      leadId: true,
      orcCupom: true,
      orcDescontoPct: true,
      orcFrete: true,
      orcFretePagoPelaEmpresa: true,
      lead: {
        select: {
          id: true,
          nome: true,
          pushName: true,
          nomeManual: true,
          telefone: true,
          cpf: true,
          cnpj: true,
          enderecos: {
            where: { OR: [{ cidade: { not: null } }, { uf: { not: null } }] },
            orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
            take: 1,
            select: { cidade: true, uf: true },
          },
        },
      },
    },
  });
  if (!negocio) return null;

  const usos = await prisma.pecaUso.findMany({
    where: { negocioId, origem: "NEGOCIO" },
    orderBy: { criadoEm: "asc" },
    select: {
      quantidade: true,
      garantia: true,
      peca: { select: { nome: true, modelo: true, precoSugerido: true } },
    },
  });

  const itens = usos.map((u) => ({
    descricao: [u.peca.nome, u.peca.modelo].filter(Boolean).join(" "),
    quantidade: u.quantidade,
    valorUnitario: u.peca.precoSugerido != null ? Number(u.peca.precoSugerido) : 0,
    garantia: u.garantia,
  }));

  const subtotal = itens
    .filter((i) => !i.garantia)
    .reduce((acc, i) => acc + i.quantidade * i.valorUnitario, 0);
  const totalGarantia = itens
    .filter((i) => i.garantia)
    .reduce((acc, i) => acc + i.quantidade * i.valorUnitario, 0);

  const descontoPct = negocio.orcDescontoPct != null ? Number(negocio.orcDescontoPct) : null;
  const frete = negocio.orcFrete != null ? Number(negocio.orcFrete) : null;
  const fretePagoPelaEmpresa = negocio.orcFretePagoPelaEmpresa === true;
  const descontoValor = subtotal * ((descontoPct ?? 0) / 100);
  const totalFinal = calcularTotalFinal({
    totalCobravel: subtotal,
    descontoPct,
    frete,
    fretePagoPelaEmpresa,
  });

  // Numero PREVIEW (nao consome sequencia): max(numero)+1. O numero DEFINITIVO so
  // e atribuido na decisao (ganho/perdido/pendente). O PDF e uma proposta.
  const agg = await prisma.orcamento.aggregate({ _max: { numero: true } });
  const numeroFormatado = formatarNumeroPedido((agg._max.numero ?? 0) + 1);

  const endereco = negocio.lead.enderecos[0];
  const nomeCliente = nomeEfetivo(negocio.lead);
  const logo = await carregarLogoEmbed();

  const dados: DadosPdfOrcamento = {
    numeroFormatado,
    dataFormatada: dataBR(new Date()),
    cliente: {
      nome: nomeCliente,
      telefone: negocio.lead.telefone ? formatarTelefone(negocio.lead.telefone) : null,
      cpf: negocio.lead.cpf,
      cnpj: negocio.lead.cnpj,
      cidade: endereco?.cidade ?? null,
      uf: endereco?.uf ?? null,
    },
    itens,
    subtotal,
    cupom: negocio.orcCupom ?? null,
    descontoPct,
    descontoValor,
    frete,
    fretePagoPelaEmpresa,
    totalFinal,
    totalGarantia,
  };

  return {
    dados,
    leadId: negocio.leadId,
    finalidade: negocio.finalidade,
    telefone: negocio.lead.telefone,
    nomeCliente,
    numeroFormatado,
    temItens: itens.length > 0,
    logo,
  };
}

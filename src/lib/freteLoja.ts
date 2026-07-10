// Cliente server-side da cotacao de frete da Loja (Fase 2). Consome a rota INTERNA
// POST /api/interno/frete/cotar da sixxis-store — que devolve as cotacoes POR
// TRANSPORTADORA + a mais barata. REUSA a MESMA config do loja.ts (STORE_API_URL +
// STORE_INTERNAL_KEY, header x-internal-key); NAO cria env nova. A chave NUNCA vai
// ao browser: so aqui, no servidor.
//
// TRAVA: frete NUNCA quebra o orcamento. Em erro/timeout/loja-off, retorna um
// resultado { ok:false, mensagem } SEM lançar — o chamador cai no frete manual.

// Item de cotacao: por produto (a Loja resolve dimensoes pelo slug/chaveLoja) OU
// por dimensoes cruas da caixa (pos-venda). Espelha o contrato da rota da Loja.
export type ItemFreteLoja =
  | { produtoId?: string; sku?: string; chaveLoja?: string; slug?: string; quantidade: number }
  | {
      dimensoes: {
        pesoKg: number;
        alturaCm: number;
        larguraCm: number;
        comprimentoCm: number;
      };
      quantidade: number;
    };

export type CotarFreteBody = {
  cepDestino: string;
  uf?: string;
  itens: ItemFreteLoja[];
};

// Uma cotacao por transportadora (com nome e, quando falha, o motivo).
export type CotacaoTransportadora = {
  carrierId: string;
  transportadora: string;
  ok: boolean;
  preco: number | null;
  prazoDias: number | null;
  erro?: string;
};

export type ResultadoFreteLoja = {
  ok: boolean;
  uf?: string | null;
  cotacoes?: CotacaoTransportadora[];
  maisBarata?: { transportadora: string; preco: number; prazoDias: number | null } | null;
  status?: string;
  mensagem: string;
};

function baseConfig(): { base: string; key: string } | null {
  const base = process.env.STORE_API_URL;
  const key = process.env.STORE_INTERNAL_KEY;
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ""), key };
}

const TIMEOUT_MS = 8_000;

// Cota o frete na Loja. NUNCA lança: qualquer falha (config ausente, rede,
// timeout, HTTP != 2xx, corpo invalido) vira { ok:false, mensagem }. Sem cache —
// o frete muda por CEP/dimensao a cada cotacao.
export async function cotarFrete(body: CotarFreteBody): Promise<ResultadoFreteLoja> {
  const cfg = baseConfig();
  if (!cfg) return { ok: false, mensagem: "estimativa indisponível" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${cfg.base}/api/interno/frete/cotar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": cfg.key,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!resp.ok) return { ok: false, mensagem: "estimativa indisponível" };
    const dados = (await resp.json()) as ResultadoFreteLoja;
    // A Loja ja padroniza { ok, uf, cotacoes, maisBarata, status, mensagem }.
    return { ...dados, mensagem: dados.mensagem ?? "" };
  } catch {
    // AbortError (timeout) ou falha de rede — frete nunca quebra o fluxo.
    return { ok: false, mensagem: "estimativa indisponível" };
  } finally {
    clearTimeout(timer);
  }
}

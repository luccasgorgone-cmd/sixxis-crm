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

// Fatia K: a cadeia real (CRM -> Loja -> Braspress + Melhor Envio + ViaCEP)
// frequentemente passa de 8s em cold start; por isso o dono precisava clicar ~3x.
// Timeout maior + retentativas automaticas eliminam os cliques repetidos.
const TIMEOUT_MS = 15_000;
// Backoff curto antes de cada RETENTATIVA (apos a 1a e a 2a falha).
const BACKOFF_MS = [500, 1200];
// 1 tentativa inicial + ate 2 retentativas.
const MAX_TENTATIVAS = 1 + BACKOFF_MS.length;

// Cota o frete na Loja. NUNCA lança: qualquer falha (config ausente, rede,
// timeout, HTTP != 2xx, corpo invalido) vira { ok:false, mensagem }. Sem cache —
// o frete muda por CEP/dimensao a cada cotacao. Retenta em timeout/rede/5xx (nunca
// em 4xx, que e erro do pedido). onRetry: hook opcional (observabilidade server).
export async function cotarFrete(
  body: CotarFreteBody,
  opts?: { onRetry?: (tentativa: number) => void },
): Promise<ResultadoFreteLoja> {
  const cfg = baseConfig();
  if (!cfg) return { ok: false, mensagem: "estimativa indisponível" };

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    if (tentativa > 0) {
      opts?.onRetry?.(tentativa);
      await new Promise((r) => setTimeout(r, BACKOFF_MS[tentativa - 1] ?? 1200));
    }

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
      if (resp.ok) {
        const dados = (await resp.json()) as ResultadoFreteLoja;
        // A Loja ja padroniza { ok, uf, cotacoes, maisBarata, status, mensagem }.
        return { ...dados, mensagem: dados.mensagem ?? "" };
      }
      // 4xx = erro do pedido (nao adianta retentar). 5xx = cai no retry.
      if (resp.status >= 400 && resp.status < 500) {
        return { ok: false, mensagem: "estimativa indisponível" };
      }
    } catch {
      // AbortError (timeout) ou falha de rede — segue para a retentativa.
    } finally {
      clearTimeout(timer);
    }
  }

  // Esgotou as tentativas — frete nunca quebra o fluxo: cai no frete manual.
  return { ok: false, mensagem: "estimativa indisponível" };
}

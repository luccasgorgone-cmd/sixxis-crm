"use client";

// Cache leve EM MEMORIA no client (Fatia L) para GETs de leitura quase-estatica
// (catalogo de pecas/produtos e listas do painel: etapas/etiquetas/agentes/
// observacoes). Evita rebuscar a MESMA lista a cada montagem/troca de cliente.
// TTL curto (default 5 min) + de-duplicacao de requisicoes em voo (a mesma URL
// pedida 2x em paralelo compartilha UMA fetch). Invalidacao explicita ao salvar.
//
// NAO usar para dados VIVOS (conversas, negocios, cobrancas): esses continuam
// buscando direto, sem cache, para refletir tempo real.

type Entrada = { expira: number; dados: unknown };

const TTL_PADRAO_MS = 5 * 60_000;
const cache = new Map<string, Entrada>();
const emVoo = new Map<string, Promise<unknown>>();

// Busca com cache por URL. Retorna o JSON parseado. Em erro de rede/HTTP nao
// cacheia (deixa tentar de novo na proxima). ttlMs sobrescreve o padrao.
export async function fetchCacheado<T = unknown>(
  url: string,
  opts?: { ttlMs?: number },
): Promise<T> {
  const agora = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expira > agora) return hit.dados as T;

  const jaEmVoo = emVoo.get(url);
  if (jaEmVoo) return jaEmVoo as Promise<T>;

  const p = (async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const dados = (await r.json()) as T;
      cache.set(url, { expira: Date.now() + (opts?.ttlMs ?? TTL_PADRAO_MS), dados });
      return dados;
    } finally {
      emVoo.delete(url);
    }
  })();
  emVoo.set(url, p);
  return p as Promise<T>;
}

// Invalida entradas do cache. Sem argumento limpa tudo; com string(s), remove as
// URLs cujo caminho COMECA com algum dos prefixos (ex.: invalidarCache("/api/pecas")
// ao salvar/editar uma peca). Chamar apos mutacoes que mudam essas listas.
export function invalidarCache(...prefixos: string[]): void {
  if (prefixos.length === 0) {
    cache.clear();
    return;
  }
  for (const url of [...cache.keys()]) {
    if (prefixos.some((p) => url.startsWith(p))) cache.delete(url);
  }
}

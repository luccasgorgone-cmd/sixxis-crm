// Camada IBGE: populacao residente estimada por UF (fonte oficial, gratuita, sem
// chave). Usada como "potencial de mercado" do Mapa (clientes por 100 mil hab.).
// Busca server-side na API de agregados (SIDRA) do IBGE. Nunca lanca: em falha
// retorna null (o cache persistente mantem o ultimo bom). Ver /api/inteligencia/mercado.
import { prisma } from "./prisma";

const TIMEOUT_MS = 12_000;

// Cache persistente reusando ClimaCacheUF (mesma disciplina da 2.40/2.41): uma
// unica linha uf="BR", dias=-3 guarda o array inteiro no Json. "BR" nao colide
// com as 27 UFs; -3 nao colide com clima ({7,14}) nem com o detalhe (-1/-2).
export const DIAS_MERCADO = -3;
export const UF_MERCADO = "BR";
// Populacao muda devagar -> TTL longo (7 dias).
export const TTL_MERCADO_MS = 7 * 24 * 60 * 60 * 1000;

// Codigo IBGE numerico da UF (nivel N3) -> sigla. Fixo (nao muda).
export const CODIGO_UF: Record<string, string> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

export type MercadoUF = { uf: string; populacao: number };

// 6579 = Estimativas de Populacao; 9324 = populacao residente estimada;
// N3[all] = todas as UFs; periodos/-1 = periodo mais recente disponivel.
const URL_SIDRA =
  "https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N3[all]";

// Estrutura da resposta SIDRA v3: [ { resultados: [ { series: [ { localidade:
// { id }, serie: { "<periodo>": "<valor>" } } ] } ] } ].
type SidraResposta = Array<{
  resultados?: Array<{
    series?: Array<{
      localidade?: { id?: string };
      serie?: Record<string, string>;
    }>;
  }>;
}>;

// Busca a populacao por UF. Retorna null em qualquer falha (rede, parse, vazio).
export async function buscarPopulacaoIBGE(): Promise<MercadoUF[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(URL_SIDRA, { signal: ctrl.signal, cache: "no-store" });
    if (!resp.ok) return null;
    const j = (await resp.json()) as SidraResposta;
    const series = j?.[0]?.resultados?.[0]?.series;
    if (!Array.isArray(series)) return null;

    const porUF: MercadoUF[] = [];
    for (const s of series) {
      const uf = CODIGO_UF[s.localidade?.id ?? ""];
      if (!uf || !s.serie) continue;
      // O periodo mais recente e o unico valor do objeto serie.
      const bruto = Object.values(s.serie)[0];
      const populacao = Number(bruto);
      if (!Number.isFinite(populacao) || populacao <= 0) continue;
      porUF.push({ uf, populacao });
    }
    return porUF.length ? porUF : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type MercadoCache = {
  porUF: MercadoUF[];
  atualizadoEm: string | null;
  stale: boolean;
};

// Le o ultimo bom no banco; se ausente/stale/refresh, re-busca no IBGE. Upsert
// SO em sucesso: uma falha nunca sobrescreve o bom. Sempre retorna o melhor dado
// disponivel (porUF pode ser [] apenas se nunca carregou com sucesso).
export async function obterMercadoComCache(refresh = false): Promise<MercadoCache> {
  const agora = Date.now();
  const linha = await prisma.climaCacheUF.findUnique({
    where: { uf_dias: { uf: UF_MERCADO, dias: DIAS_MERCADO } },
  });

  const stale =
    !linha || refresh || agora - linha.atualizadoEm.getTime() > TTL_MERCADO_MS;

  if (stale) {
    const novo = await buscarPopulacaoIBGE();
    if (novo) {
      const nowDate = new Date();
      await prisma.climaCacheUF.upsert({
        where: { uf_dias: { uf: UF_MERCADO, dias: DIAS_MERCADO } },
        create: {
          uf: UF_MERCADO,
          dias: DIAS_MERCADO,
          dados: { porUF: novo } as object,
          atualizadoEm: nowDate,
        },
        update: { dados: { porUF: novo } as object, atualizadoEm: nowDate },
      });
      return { porUF: novo, atualizadoEm: nowDate.toISOString(), stale: false };
    }
  }

  if (linha) {
    const dados = linha.dados as unknown as { porUF?: MercadoUF[] };
    return {
      porUF: Array.isArray(dados?.porUF) ? dados.porUF : [],
      atualizadoEm: linha.atualizadoEm.toISOString(),
      stale: agora - linha.atualizadoEm.getTime() > TTL_MERCADO_MS,
    };
  }
  return { porUF: [], atualizadoEm: null, stale: false };
}

// Atalho: Map uf -> populacao (para joins no /api/mapa).
export async function mapaPopulacao(): Promise<Map<string, number>> {
  const { porUF } = await obterMercadoComCache();
  const m = new Map<string, number>();
  for (const p of porUF) m.set(p.uf, p.populacao);
  return m;
}

// Camada de clima da Inteligencia Regional: busca na Open-Meteo (server-side,
// sem chave) e calcula o "indice de oportunidade" de venda de climatizador.
// O CACHE agora e PERSISTENTE (tabela ClimaCacheUF, por uf+dias): falha de fetch
// NUNCA sobrescreve o ultimo bom. A orquestracao (concorrencia limitada, upsert
// so em sucesso, montagem a partir do banco) fica na rota /api/inteligencia/clima.
import { CAPITAIS } from "./capitais";

// TTL: apos 3h o dado e considerado "stale" (tenta re-buscar; se falhar, mantem).
export const TTL_MS = 3 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

// Dados meteorologicos + indice de uma UF (o objeto guardado em ClimaCacheUF.dados).
export type ClimaUF = {
  uf: string;
  tempAtual: number | null;
  sensacao: number | null;
  umidade: number | null;
  chuvaAgora: number | null;
  tempMax: number | null;
  tempMin: number | null;
  chuvaPrevista: number | null;
  umidadeMax: number | null;
  indiceOportunidade: number | null;
  erro: boolean;
};

// Shape por UF na RESPOSTA: dados + quando foi atualizado + se esta desatualizado.
export type ClimaUFResp = ClimaUF & {
  atualizadoEm: string | null;
  stale: boolean;
};

export type ClimaResultado = {
  dias: number;
  atualizadoEm: string | null; // mais recente entre as UFs
  fonte: string;
  porUF: ClimaUFResp[];
};

// clamp((x-min)/(max-min),0,1)*100 — normaliza x para 0..100 dentro da faixa.
function norm(x: number, min: number, max: number): number {
  if (max === min) return 0;
  const t = (x - min) / (max - min);
  return Math.min(1, Math.max(0, t)) * 100;
}
function maxDe(nums: number[]): number | null {
  return nums.length ? Math.max(...nums) : null;
}
function minDe(nums: number[]): number | null {
  return nums.length ? Math.min(...nums) : null;
}

// UF "sem dado" (nunca carregou com sucesso). erro:true, tudo null.
export function ufSemDado(uf: string): ClimaUF {
  return {
    uf,
    tempAtual: null,
    sensacao: null,
    umidade: null,
    chuvaAgora: null,
    tempMax: null,
    tempMin: null,
    chuvaPrevista: null,
    umidadeMax: null,
    indiceOportunidade: null,
    erro: true,
  };
}

// Busca o clima de uma UF na Open-Meteo. Nunca lanca: em falha retorna erro:true.
async function buscarUF(uf: string, dias: number): Promise<ClimaUF> {
  const c = CAPITAIS[uf];
  if (!c) return ufSemDado(uf);

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,apparent_temperature` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max` +
    `&timezone=auto&forecast_days=${dias}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) return ufSemDado(uf);
    const j = await resp.json();

    const cur = j.current ?? {};
    const daily = j.daily ?? {};
    const num = (arr: unknown): number[] =>
      Array.isArray(arr) ? arr.filter((v) => typeof v === "number") : [];
    const tMax = num(daily.temperature_2m_max);
    const tMin = num(daily.temperature_2m_min);
    const chuva = num(daily.precipitation_sum);
    const umidDaily = num(daily.relative_humidity_2m_max);

    const tempAtual =
      typeof cur.temperature_2m === "number" ? cur.temperature_2m : null;
    const sensacao =
      typeof cur.apparent_temperature === "number"
        ? cur.apparent_temperature
        : null;
    const umidade =
      typeof cur.relative_humidity_2m === "number"
        ? cur.relative_humidity_2m
        : null;
    const chuvaAgora =
      typeof cur.precipitation === "number" ? cur.precipitation : null;

    const tempMax = maxDe(tMax);
    const tempMin = minDe(tMin);
    const chuvaPrevista = chuva.length
      ? Math.round(chuva.reduce((s, v) => s + v, 0) * 10) / 10
      : null;
    const umidadeMax = maxDe(umidDaily);

    // indiceOportunidade (0-100): NAO e um indice meteorologico oficial. E um
    // "indice de oportunidade de venda de climatizador" transparente, derivado
    // do clima real: quanto mais quente, seco e sem chuva prevista, maior.
    let indiceOportunidade: number | null = null;
    if (tempMax != null && umidade != null && chuvaPrevista != null) {
      const calor = norm(tempMax, 18, 40); // mais quente -> maior
      const seco = 100 - umidade; // menos umido (umidade atual) -> maior
      const semChuva = 100 - norm(chuvaPrevista, 0, 25); // menos chuva -> maior
      indiceOportunidade = Math.round(
        0.5 * calor + 0.3 * seco + 0.2 * semChuva,
      );
    }

    return {
      uf,
      tempAtual,
      sensacao,
      umidade,
      chuvaAgora,
      tempMax,
      tempMin,
      chuvaPrevista,
      umidadeMax,
      indiceOportunidade,
      erro: false,
    };
  } catch {
    return ufSemDado(uf);
  }
}

// Busca com 1 retry em caso de falha (a Open-Meteo as vezes derruba sob rajada).
export async function buscarUFComRetry(
  uf: string,
  dias: number,
): Promise<ClimaUF> {
  const r1 = await buscarUF(uf, dias);
  if (!r1.erro) return r1;
  return buscarUF(uf, dias);
}

// Executa `fn` sobre `itens` com no maximo `limite` em paralelo (lotes). Evita
// disparar as 27 UFs de uma vez e estourar o rate-limit da Open-Meteo.
export async function mapLimit<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += limite) {
    const lote = itens.slice(i, i + limite);
    const res = await Promise.all(lote.map(fn));
    saida.push(...res);
  }
  return saida;
}

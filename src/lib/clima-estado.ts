// Detalhe de clima por estado (drill-down da Inteligencia Regional): curva
// horaria de hoje (24h) + historico diario dos ultimos ~30 dias + tendencia.
// Busca na Open-Meteo (server-side, sem chave): forecast (horaria) e archive
// (historico). Nunca lanca: em falha retorna { erro: true }. A orquestracao de
// cache (persistente, upsert so em sucesso) fica na rota; aqui so o fetch/calculo.
import { CAPITAIS } from "./capitais";

// TTLs por parte: horaria muda ao longo do dia (~3h); historico e estavel (~12h);
// previsao estendida ~6h.
export const TTL_HORARIA_MS = 3 * 60 * 60 * 1000;
export const TTL_HISTORICO_MS = 12 * 60 * 60 * 1000;
export const TTL_PREVISAO_MS = 6 * 60 * 60 * 1000;
// Sentinelas de `dias` para reusar a tabela ClimaCacheUF (evita colidir com {7,14}).
export const DIAS_HORARIA = -1;
export const DIAS_HISTORICO = -2;
export const DIAS_PREVISAO = -5;
const TIMEOUT_MS = 10_000;
// Teto de dias da previsao diaria da Open-Meteo.
const PREVISAO_DIAS = 16;

// Ponto horario ENRIQUECIDO: temp + umidade + sensacao + vento + condicao.
export type PontoHora = {
  hora: string;
  temp: number | null;
  umidade: number | null;
  sensacao: number | null;
  vento: number | null;
  weathercode: number | null;
};
export type PontoDia = {
  dia: string;
  tempMax: number | null;
  tempMin: number | null;
  chuva: number | null;
};
// Ponto da PREVISAO estendida (dia a dia, ate 16d) com condicao/prob/vento/UV.
export type PontoPrevisao = {
  dia: string;
  tempMax: number | null;
  tempMin: number | null;
  chuva: number | null; // precipitation_sum (mm)
  chuvaProb: number | null; // precipitation_probability_max (%)
  vento: number | null; // wind_speed_10m_max (km/h)
  uv: number | null; // uv_index_max
  weathercode: number | null;
};
// Clima ATUAL (current weather).
export type ClimaAtual = {
  temp: number | null;
  sensacao: number | null;
  umidade: number | null;
  vento: number | null;
  chuva: number | null;
  weathercode: number | null;
};
export type Tendencia = "esquentando" | "esfriando" | "estavel";

// Blocos guardados no cache (um por sentinela de `dias`).
export type BlocoHoraria = { uf: string; horarioHoje: PontoHora[]; erro: boolean };
export type BlocoHistorico = { uf: string; historico: PontoDia[]; erro: boolean };
export type BlocoPrevisao = {
  uf: string;
  atual: ClimaAtual | null;
  previsao: PontoPrevisao[];
  erro: boolean;
};

// Resposta do endpoint de detalhe (sempre 200; partes podem degradar).
export type DetalheClimaResp = {
  uf: string;
  capital: string;
  fonte: string;
  atual: ClimaAtual | null;
  horarioHoje: PontoHora[];
  horarioAtualizadoEm: string | null;
  horarioErro: boolean;
  previsao: PontoPrevisao[];
  previsaoAtualizadoEm: string | null;
  previsaoErro: boolean;
  historico: PontoDia[];
  historicoAtualizadoEm: string | null;
  historicoErro: boolean;
  tendencia: Tendencia | null;
};

function numArr(arr: unknown): (number | null)[] {
  return Array.isArray(arr) ? arr.map((v) => (typeof v === "number" ? v : null)) : [];
}
function strArr(arr: unknown): string[] {
  return Array.isArray(arr) ? arr.map((v) => (typeof v === "string" ? v : "")) : [];
}

// Data (UTC) deslocada por `offset` dias, no formato YYYY-MM-DD para a Open-Meteo.
export function ymdOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Curva horaria de HOJE (24 pontos), ENRIQUECIDA: temperatura, umidade, sensacao
// termica (apparent_temperature), vento (wind_speed_10m) e condicao (weather_code).
export async function buscarHoraria(uf: string): Promise<BlocoHoraria> {
  const c = CAPITAIS[uf];
  if (!c) return { uf, horarioHoje: [], erro: true };
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
    `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,` +
    `precipitation_probability,wind_speed_10m,weather_code` +
    `&forecast_days=1&timezone=auto`;
  const j = (await fetchJson(url)) as { hourly?: Record<string, unknown> } | null;
  if (!j?.hourly) return { uf, horarioHoje: [], erro: true };
  const horas = strArr(j.hourly.time);
  const temp = numArr(j.hourly.temperature_2m);
  const umid = numArr(j.hourly.relative_humidity_2m);
  const sens = numArr(j.hourly.apparent_temperature);
  const vento = numArr(j.hourly.wind_speed_10m);
  const cond = numArr(j.hourly.weather_code);
  const pontos: PontoHora[] = horas.map((t, i) => ({
    hora: t.length >= 16 ? t.slice(11, 16) : t, // "HH:MM"
    temp: temp[i] ?? null,
    umidade: umid[i] ?? null,
    sensacao: sens[i] ?? null,
    vento: vento[i] ?? null,
    weathercode: cond[i] ?? null,
  }));
  if (!pontos.length) return { uf, horarioHoje: [], erro: true };
  return { uf, horarioHoje: pontos, erro: false };
}

// Clima ATUAL + PREVISAO estendida (ate 16 dias) numa unica chamada forecast.
// Daily: max/min, chuva (mm), prob. de chuva, vento max, UV, condicao. Current:
// temp/sensacao/umidade/vento/chuva/condicao.
export async function buscarPrevisao(uf: string): Promise<BlocoPrevisao> {
  const c = CAPITAIS[uf];
  if (!c) return { uf, atual: null, previsao: [], erro: true };
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
    `precipitation,wind_speed_10m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,` +
    `precipitation_probability_max,wind_speed_10m_max,uv_index_max,weather_code` +
    `&forecast_days=${PREVISAO_DIAS}&timezone=auto`;
  const j = (await fetchJson(url)) as {
    current?: Record<string, unknown>;
    daily?: Record<string, unknown>;
  } | null;
  if (!j?.daily) return { uf, atual: null, previsao: [], erro: true };

  const numOuNull = (v: unknown): number | null =>
    typeof v === "number" ? v : null;
  const cur = j.current ?? {};
  const atual: ClimaAtual = {
    temp: numOuNull(cur.temperature_2m),
    sensacao: numOuNull(cur.apparent_temperature),
    umidade: numOuNull(cur.relative_humidity_2m),
    vento: numOuNull(cur.wind_speed_10m),
    chuva: numOuNull(cur.precipitation),
    weathercode: numOuNull(cur.weather_code),
  };

  const dias = strArr(j.daily.time);
  const tMax = numArr(j.daily.temperature_2m_max);
  const tMin = numArr(j.daily.temperature_2m_min);
  const chuva = numArr(j.daily.precipitation_sum);
  const chuvaProb = numArr(j.daily.precipitation_probability_max);
  const vento = numArr(j.daily.wind_speed_10m_max);
  const uv = numArr(j.daily.uv_index_max);
  const cond = numArr(j.daily.weather_code);
  const previsao: PontoPrevisao[] = dias.map((d, i) => ({
    dia: d,
    tempMax: tMax[i] ?? null,
    tempMin: tMin[i] ?? null,
    chuva: chuva[i] ?? null,
    chuvaProb: chuvaProb[i] ?? null,
    vento: vento[i] ?? null,
    uv: uv[i] ?? null,
    weathercode: cond[i] ?? null,
  }));
  if (!previsao.length) return { uf, atual, previsao: [], erro: true };
  return { uf, atual, previsao, erro: false };
}

// Historico diario dos ultimos ~30 dias (archive tem lag de 2-3 dias -> hoje-3).
export async function buscarHistorico(uf: string): Promise<BlocoHistorico> {
  const c = CAPITAIS[uf];
  if (!c) return { uf, historico: [], erro: true };
  const start = ymdOffset(-33);
  const end = ymdOffset(-3);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lon}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
  const j = (await fetchJson(url)) as { daily?: Record<string, unknown> } | null;
  if (!j?.daily) return { uf, historico: [], erro: true };
  const dias = strArr(j.daily.time);
  const tMax = numArr(j.daily.temperature_2m_max);
  const tMin = numArr(j.daily.temperature_2m_min);
  const chuva = numArr(j.daily.precipitation_sum);
  const pontos: PontoDia[] = dias.map((d, i) => ({
    dia: d,
    tempMax: tMax[i] ?? null,
    tempMin: tMin[i] ?? null,
    chuva: chuva[i] ?? null,
  }));
  if (!pontos.length) return { uf, historico: [], erro: true };
  return { uf, historico: pontos, erro: false };
}

// 1 retry (a Open-Meteo as vezes derruba sob rajada).
export async function buscarHorariaComRetry(uf: string): Promise<BlocoHoraria> {
  const r = await buscarHoraria(uf);
  return r.erro ? buscarHoraria(uf) : r;
}
export async function buscarHistoricoComRetry(uf: string): Promise<BlocoHistorico> {
  const r = await buscarHistorico(uf);
  return r.erro ? buscarHistorico(uf) : r;
}
export async function buscarPrevisaoComRetry(uf: string): Promise<BlocoPrevisao> {
  const r = await buscarPrevisao(uf);
  return r.erro ? buscarPrevisao(uf) : r;
}

// Tendencia: media das maximas dos ultimos 7 dias vs os 7 anteriores.
// Diferenca > 0.5C esquenta, < -0.5C esfria, senao estavel. null se dados curtos.
export function calcularTendencia(historico: PontoDia[]): Tendencia | null {
  const maximas = historico
    .map((p) => p.tempMax)
    .filter((v): v is number => typeof v === "number");
  if (maximas.length < 14) return null;
  const ult7 = maximas.slice(-7);
  const ant7 = maximas.slice(-14, -7);
  const media = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const delta = media(ult7) - media(ant7);
  if (delta > 0.5) return "esquentando";
  if (delta < -0.5) return "esfriando";
  return "estavel";
}

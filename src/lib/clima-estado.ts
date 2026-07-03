// Detalhe de clima por estado (drill-down da Inteligencia Regional): curva
// horaria de hoje (24h) + historico diario dos ultimos ~30 dias + tendencia.
// Busca na Open-Meteo (server-side, sem chave): forecast (horaria) e archive
// (historico). Nunca lanca: em falha retorna { erro: true }. A orquestracao de
// cache (persistente, upsert so em sucesso) fica na rota; aqui so o fetch/calculo.
import { CAPITAIS } from "./capitais";

// TTLs por parte: horaria muda ao longo do dia (~3h); historico e estavel (~12h);
// UV opcional ~6h.
export const TTL_HORARIA_MS = 3 * 60 * 60 * 1000;
export const TTL_HISTORICO_MS = 12 * 60 * 60 * 1000;
export const TTL_UV_MS = 6 * 60 * 60 * 1000;
// Sentinelas de `dias` para reusar a tabela ClimaCacheUF (evita colidir com {7,14}).
// -1 horaria (7 dias hora a hora; atual + 24h + previsao derivam dela), -2
// historico, -5 UV opcional.
export const DIAS_HORARIA = -1;
export const DIAS_HISTORICO = -2;
export const DIAS_UV = -5;
const TIMEOUT_MS = 10_000;
// Horizonte da horaria estendida (dias). A query leve suporta bem 7 dias.
export const HORARIA_DIAS = 7;
// Teto de dias da Open-Meteo (usado pelo diagnostico da query daily pesada).
const PREVISAO_DIAS = 16;

// Ponto horario ENRIQUECIDO: temp + umidade + sensacao + vento + chuva + condicao.
// `iso` = data-hora LOCAL "YYYY-MM-DDTHH:MM" (para agrupar por dia e achar "agora").
export type PontoHora = {
  hora: string;
  iso: string;
  temp: number | null;
  umidade: number | null;
  sensacao: number | null;
  vento: number | null;
  chuva: number | null; // precipitation (mm) na hora
  chuvaProb: number | null;
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
// horarioHoje guarda AS 7 DIAS de pontos horarios (a UI usa as 24 primeiras p/ a
// curva; atual e previsao sao derivados). utcOffsetSeconds vem da Open-Meteo.
export type BlocoHoraria = {
  uf: string;
  horarioHoje: PontoHora[];
  utcOffsetSeconds: number;
  erro: boolean;
};
export type BlocoHistorico = { uf: string; historico: PontoDia[]; erro: boolean };
export type BlocoPrevisao = {
  uf: string;
  atual: ClimaAtual | null;
  previsao: PontoPrevisao[];
  erro: boolean;
};
export type BlocoAtual = { uf: string; atual: ClimaAtual | null; erro: boolean };
// UV maximo por dia (YYYY-MM-DD -> indice UV). Bloco OPCIONAL e nao-bloqueante:
// se falhar, a previsao fica com uv null ("—" na UI).
export type BlocoUv = {
  uf: string;
  uvPorDia: Record<string, number | null>;
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

// Variante instrumentada: le o corpo mesmo em !ok e expoe status + reason (a
// Open-Meteo devolve { error:true, reason:"..." } em 400). Usada pela previsao e
// pelo endpoint de diagnostico. Nao lanca; nunca loga em loop (o chamador decide).
export type DiagFetch = {
  ok: boolean;
  status: number;
  json: unknown | null;
  reason: string | null;
  corpo: string;
};
export async function fetchJsonDiag(url: string): Promise<DiagFetch> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    const corpo = await resp.text();
    let json: unknown | null = null;
    try {
      json = JSON.parse(corpo);
    } catch {
      json = null;
    }
    const reason =
      json && typeof json === "object" && "reason" in json
        ? String((json as { reason: unknown }).reason)
        : null;
    return { ok: resp.ok, status: resp.status, json, reason, corpo: corpo.slice(0, 500) };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: null,
      reason: e instanceof Error ? e.message : "erro de rede",
      corpo: "",
    };
  } finally {
    clearTimeout(timer);
  }
}

// Curva horaria ESTENDIDA (7 dias, hora a hora): temperatura, umidade, sensacao,
// vento, chuva (mm), prob. chuva e condicao. Esta e a MESMA query leve que ja
// funcionava (so com mais dias) — dela derivamos o "agora", a curva 24h e a
// previsao diaria de 7 dias, eliminando as queries pesadas (daily 16d / &current=)
// que davam timeout a partir do IP do Railway.
export async function buscarHoraria(
  uf: string,
  dias = HORARIA_DIAS,
): Promise<BlocoHoraria> {
  const c = CAPITAIS[uf];
  if (!c) return { uf, horarioHoje: [], utcOffsetSeconds: 0, erro: true };
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
    `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,` +
    `precipitation,precipitation_probability,wind_speed_10m,weather_code` +
    `&forecast_days=${dias}&timezone=auto`;
  const j = (await fetchJson(url)) as {
    hourly?: Record<string, unknown>;
    utc_offset_seconds?: unknown;
  } | null;
  if (!j?.hourly) return { uf, horarioHoje: [], utcOffsetSeconds: 0, erro: true };
  const horas = strArr(j.hourly.time);
  const temp = numArr(j.hourly.temperature_2m);
  const umid = numArr(j.hourly.relative_humidity_2m);
  const sens = numArr(j.hourly.apparent_temperature);
  const chuva = numArr(j.hourly.precipitation);
  const vento = numArr(j.hourly.wind_speed_10m);
  const prob = numArr(j.hourly.precipitation_probability);
  const cond = numArr(j.hourly.weather_code);
  const pontos: PontoHora[] = horas.map((t, i) => ({
    hora: t.length >= 16 ? t.slice(11, 16) : t, // "HH:MM"
    iso: t,
    temp: temp[i] ?? null,
    umidade: umid[i] ?? null,
    sensacao: sens[i] ?? null,
    vento: vento[i] ?? null,
    chuva: chuva[i] ?? null,
    chuvaProb: prob[i] ?? null,
    weathercode: cond[i] ?? null,
  }));
  if (!pontos.length) return { uf, horarioHoje: [], utcOffsetSeconds: 0, erro: true };
  const utcOffsetSeconds =
    typeof j.utc_offset_seconds === "number" ? j.utc_offset_seconds : 0;
  return { uf, horarioHoje: pontos, utcOffsetSeconds, erro: false };
}

// Milissegundos "de parede" de um horario LOCAL "YYYY-MM-DDTHH:MM" (tratado como
// UTC para comparacao relativa entre pontos e com o "agora" local).
function paredeMs(iso: string): number {
  const ms = Date.parse(`${iso.length >= 16 ? iso.slice(0, 16) : iso}:00Z`);
  return Number.isNaN(ms) ? 0 : ms;
}

// CLIMA ATUAL derivado da horaria: a hora mais proxima de "agora" no fuso do
// estado (ultima hora <= agora; se todas forem futuras, a primeira).
export function derivarAtual(bloco: BlocoHoraria): ClimaAtual | null {
  const pts = bloco.horarioHoje;
  if (!pts.length) return null;
  const agoraLocal = Date.now() + bloco.utcOffsetSeconds * 1000;
  let escolhido = pts[0];
  for (const p of pts) {
    if (paredeMs(p.iso) <= agoraLocal) escolhido = p;
    else break;
  }
  return {
    temp: escolhido.temp,
    sensacao: escolhido.sensacao,
    umidade: escolhido.umidade,
    vento: escolhido.vento,
    chuva: escolhido.chuva,
    weathercode: escolhido.weathercode,
  };
}

// PREVISAO DIARIA (ate 7 dias) derivada da horaria: agrupa por data local e
// agrega. tempMax/min, chuva = soma do dia, chuvaProb = max, vento = max,
// weathercode = o "pior" do dia (codigo WMO mais alto ~ mais severo). uv = null
// (a horaria padrao nao traz UV; a Parte 2 enriquece opcionalmente).
export function derivarPrevisaoDiaria(bloco: BlocoHoraria): PontoPrevisao[] {
  const ordem: string[] = [];
  const grupos = new Map<string, PontoHora[]>();
  for (const p of bloco.horarioHoje) {
    const dia = p.iso.slice(0, 10);
    if (!grupos.has(dia)) {
      grupos.set(dia, []);
      ordem.push(dia);
    }
    grupos.get(dia)!.push(p);
  }
  const nums = (arr: (number | null)[]) =>
    arr.filter((v): v is number => typeof v === "number");
  return ordem.slice(0, HORARIA_DIAS).map((dia) => {
    const hs = grupos.get(dia)!;
    const temps = nums(hs.map((h) => h.temp));
    const chuvas = nums(hs.map((h) => h.chuva));
    const probs = nums(hs.map((h) => h.chuvaProb));
    const ventos = nums(hs.map((h) => h.vento));
    const codes = nums(hs.map((h) => h.weathercode));
    const somaChuva = chuvas.length
      ? Math.round(chuvas.reduce((s, v) => s + v, 0) * 10) / 10
      : null;
    return {
      dia,
      tempMax: temps.length ? Math.max(...temps) : null,
      tempMin: temps.length ? Math.min(...temps) : null,
      chuva: somaChuva,
      chuvaProb: probs.length ? Math.max(...probs) : null,
      vento: ventos.length ? Math.max(...ventos) : null,
      uv: null,
      weathercode: codes.length ? Math.max(...codes) : null,
    };
  });
}

// Variaveis diarias da previsao, em camadas: da mais completa para a basica. Se
// a Open-Meteo recusar a camada completa (ex.: uma variavel nao suportada em todo
// o horizonte), caimos para a proxima — sempre MAXIMIZANDO dado real; o que nao
// vier fica null ("—" na UI, nunca inventado).
const DAILY_FULL =
  "temperature_2m_max,temperature_2m_min,precipitation_sum," +
  "precipitation_probability_max,wind_speed_10m_max,uv_index_max,weather_code";
const DAILY_SEM_UV_PROB =
  "temperature_2m_max,temperature_2m_min,precipitation_sum," +
  "wind_speed_10m_max,weather_code";
const DAILY_BASICO =
  "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code";
const CAMADAS_DAILY = [DAILY_FULL, DAILY_SEM_UV_PROB, DAILY_BASICO];

// Monta a URL da previsao (daily) para uma capital, dias e conjunto de variaveis.
export function montarUrlPrevisao(
  lat: number,
  lon: number,
  daily: string,
  dias: number,
): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=${daily}&forecast_days=${dias}&timezone=auto`
  );
}

// Diagnostico cru da previsao para 1 UF: status + reason da Open-Meteo na camada
// completa e qual camada funciona. Usado pelo endpoint admin de diagnostico.
export type DiagnosticoPrevisao = {
  uf: string;
  capital: string | null;
  full: {
    url: string;
    status: number;
    ok: boolean;
    reason: string | null;
    corpo: string;
    dias: number | null;
  };
  camadaQueFunciona: number | null; // indice em CAMADAS_DAILY (0 = completa)
  diasNaCamada: number | null;
};
export async function diagnosticarPrevisao(uf: string): Promise<DiagnosticoPrevisao> {
  const c = CAPITAIS[uf];
  if (!c) {
    return {
      uf,
      capital: null,
      full: { url: "", status: 0, ok: false, reason: "uf invalida", corpo: "", dias: null },
      camadaQueFunciona: null,
      diasNaCamada: null,
    };
  }
  const urlFull = montarUrlPrevisao(c.lat, c.lon, DAILY_FULL, PREVISAO_DIAS);
  const r = await fetchJsonDiag(urlFull);
  const diasFull = (() => {
    const d = (r.json as { daily?: { time?: unknown } } | null)?.daily?.time;
    return Array.isArray(d) ? d.length : null;
  })();

  let camadaQueFunciona: number | null = null;
  let diasNaCamada: number | null = null;
  for (let i = 0; i < CAMADAS_DAILY.length; i++) {
    const rr = await fetchJsonDiag(
      montarUrlPrevisao(c.lat, c.lon, CAMADAS_DAILY[i], PREVISAO_DIAS),
    );
    const t = (rr.json as { daily?: { time?: unknown } } | null)?.daily?.time;
    if (rr.ok && Array.isArray(t) && t.length > 0) {
      camadaQueFunciona = i;
      diasNaCamada = t.length;
      break;
    }
  }
  return {
    uf,
    capital: c.capital,
    full: {
      url: urlFull,
      status: r.status,
      ok: r.ok,
      reason: r.reason,
      corpo: r.corpo,
      dias: diasFull,
    },
    camadaQueFunciona,
    diasNaCamada,
  };
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

// UV opcional: query daily MINIMA (so uv_index_max, 7 dias) — leve (1 variavel).
// Nao-bloqueante: se abortar/falhar, a previsao segue com uv null. Nunca inventa.
export async function buscarUv(uf: string, dias = HORARIA_DIAS): Promise<BlocoUv> {
  const c = CAPITAIS[uf];
  if (!c) return { uf, uvPorDia: {}, erro: true };
  const url = montarUrlPrevisao(c.lat, c.lon, "uv_index_max", dias);
  const j = (await fetchJson(url)) as { daily?: Record<string, unknown> } | null;
  if (!j?.daily) return { uf, uvPorDia: {}, erro: true };
  const diasArr = strArr(j.daily.time);
  const uvArr = numArr(j.daily.uv_index_max);
  if (!diasArr.length) return { uf, uvPorDia: {}, erro: true };
  const uvPorDia: Record<string, number | null> = {};
  diasArr.forEach((d, i) => {
    uvPorDia[d] = uvArr[i] ?? null;
  });
  return { uf, uvPorDia, erro: false };
}
export async function buscarUvComRetry(uf: string): Promise<BlocoUv> {
  const r = await buscarUv(uf);
  return r.erro ? buscarUv(uf) : r;
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

// Inteligencia Regional: clima atual + previsao por UF (capital de referencia),
// via Open-Meteo (server-side, sem chave). Alem dos dados meteorologicos, calcula
// um "indice de oportunidade" de venda de climatizador derivado do clima real.
// GET /api/inteligencia/clima?dias=7&refresh=0  (agente logado)
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { CAPITAIS } from "@/lib/capitais";
import {
  obterCache,
  gravarCache,
  type ClimaUF,
  type ClimaResultado,
} from "@/lib/clima-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 15_000;

// clamp((x-min)/(max-min),0,1)*100 — normaliza x para 0..100 dentro da faixa.
function norm(x: number, min: number, max: number): number {
  if (max === min) return 0;
  const t = (x - min) / (max - min);
  return Math.min(1, Math.max(0, t)) * 100;
}

function max(nums: number[]): number | null {
  return nums.length ? Math.max(...nums) : null;
}
function min(nums: number[]): number | null {
  return nums.length ? Math.min(...nums) : null;
}

// Busca o clima de uma UF na Open-Meteo. Nunca lanca: em qualquer falha retorna
// a UF com valores null e erro:true (para nao derrubar o endpoint inteiro).
async function buscarUF(uf: string, dias: number): Promise<ClimaUF> {
  const c = CAPITAIS[uf];
  const vazio: ClimaUF = {
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
  if (!c) return vazio;

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
    if (!resp.ok) return vazio;
    const j = await resp.json();

    const cur = j.current ?? {};
    const daily = j.daily ?? {};
    const tMax: number[] = Array.isArray(daily.temperature_2m_max)
      ? daily.temperature_2m_max.filter((v: unknown) => typeof v === "number")
      : [];
    const tMin: number[] = Array.isArray(daily.temperature_2m_min)
      ? daily.temperature_2m_min.filter((v: unknown) => typeof v === "number")
      : [];
    const chuva: number[] = Array.isArray(daily.precipitation_sum)
      ? daily.precipitation_sum.filter((v: unknown) => typeof v === "number")
      : [];
    const umidDaily: number[] = Array.isArray(daily.relative_humidity_2m_max)
      ? daily.relative_humidity_2m_max.filter(
          (v: unknown) => typeof v === "number",
        )
      : [];

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

    const tempMax = max(tMax);
    const tempMin = min(tMin);
    const chuvaPrevistaRaw = chuva.reduce((s, v) => s + v, 0);
    const chuvaPrevista = chuva.length
      ? Math.round(chuvaPrevistaRaw * 10) / 10
      : null;
    const umidadeMax = max(umidDaily);

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
    return vazio;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const diasParam = Number(sp.get("dias"));
  const dias = diasParam === 14 ? 14 : 7; // apenas {7,14}, default 7
  const refresh = sp.get("refresh") === "1";

  if (!refresh) {
    const cached = obterCache(dias);
    if (cached) return NextResponse.json(cached);
  }

  const ufs = Object.keys(CAPITAIS);
  const porUF = await Promise.all(ufs.map((uf) => buscarUF(uf, dias)));

  const resultado: ClimaResultado = {
    dias,
    atualizadoEm: new Date().toISOString(),
    fonte: "Open-Meteo",
    porUF,
  };
  gravarCache(dias, resultado);

  return NextResponse.json(resultado);
}

// Diagnostico (admin): o servidor (Railway) alcanca o Google Trends? O Trends
// nao tem API oficial e costuma bloquear IPs de datacenter. Este probe faz duas
// chamadas server-side (nunca do browser) e reporta status/tamanho/token cru,
// SEM escrever nada. Serve para decidir se vale construir uma camada Trends.
// GET /api/admin/diagnostico/trends  (admin -> 403)
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 12_000;
// UA de navegador real: o Trends rejeita clientes sem cara de browser.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type ResultadoChamada = {
  status: number | null;
  tamanho: number;
  erro?: string;
};

async function chamar(
  url: string,
): Promise<{ resp: Response | null; corpo: string; status: number | null; erro?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent": UA,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Accept: "*/*",
      },
    });
    const corpo = await resp.text();
    return { resp, corpo, status: resp.status };
  } catch (e) {
    return {
      resp: null,
      corpo: "",
      status: null,
      erro: e instanceof Error ? e.message : "falha desconhecida",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }

  // a) explore: retorna JSON (prefixado com ")]}'," e com "token" nos widgets).
  const reqParam = JSON.stringify({
    comparisonItem: [
      { keyword: "climatizador", geo: "BR", time: "today 12-m" },
    ],
    category: 0,
    property: "",
  });
  const urlExplore =
    "https://trends.google.com/trends/api/explore?hl=pt-BR&tz=180&req=" +
    encodeURIComponent(reqParam);
  const ex = await chamar(urlExplore);
  const explore: ResultadoChamada & { temToken: boolean; inicio: string } = {
    status: ex.status,
    tamanho: ex.corpo.length,
    temToken: ex.corpo.includes('"token"'),
    // Primeiros chars ajudam a distinguir JSON valido de pagina de bloqueio.
    inicio: ex.corpo.slice(0, 200),
    ...(ex.erro ? { erro: ex.erro } : {}),
  };

  // b) rss: feed de buscas em alta do dia (mais permissivo que o explore).
  const rssRes = await chamar(
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=BR",
  );
  const rss: ResultadoChamada = {
    status: rssRes.status,
    tamanho: rssRes.corpo.length,
    ...(rssRes.erro ? { erro: rssRes.erro } : {}),
  };

  return NextResponse.json({ explore, rss });
}

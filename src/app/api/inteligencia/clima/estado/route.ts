// Inteligencia Regional: DETALHE de clima de um estado (drill-down do drawer).
// Curva horaria de hoje (24h) + historico diario dos ultimos ~30 dias +
// tendencia. Cache PERSISTENTE por UF reusando ClimaCacheUF com `dias` sentinela
// (-1 horaria, -2 historico). Disciplina da 2.40: um fetch que falha NUNCA
// sobrescreve o ultimo bom.
//
// STALE-WHILE-REVALIDATE (Fatia 2.50, igual /api/inteligencia/clima): responde NA
// HORA com o cache (mesmo stale) e re-busca o que esta stale em BACKGROUND. So
// bloqueia (com TETO ~8s) quando um bloco NAO tem NENHUM cache. Nunca pendura.
// GET /api/inteligencia/clima/estado?uf=XX  (agente logado)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { CAPITAIS } from "@/lib/capitais";
import {
  TTL_HORARIA_MS,
  TTL_HISTORICO_MS,
  TTL_PREVISAO_MS,
  TTL_ATUAL_MS,
  DIAS_HORARIA,
  DIAS_HISTORICO,
  DIAS_PREVISAO,
  DIAS_ATUAL,
  buscarHorariaComRetry,
  buscarHistoricoComRetry,
  buscarPrevisaoComRetry,
  buscarAtualComRetry,
  calcularTendencia,
  type BlocoHoraria,
  type BlocoHistorico,
  type BlocoPrevisao,
  type BlocoAtual,
  type DetalheClimaResp,
} from "@/lib/clima-estado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TETO_CACHE_VAZIO_MS = 8_000;

// Lock por (uf:bloco) evita reconstrucoes concorrentes do mesmo dado.
const emReconstrucao = new Set<string>();

type Bloco = "hor" | "hist" | "prev" | "atual";
const SENTINELA: Record<Bloco, number> = {
  hor: DIAS_HORARIA,
  hist: DIAS_HISTORICO,
  prev: DIAS_PREVISAO,
  atual: DIAS_ATUAL,
};

async function buscarBloco(
  uf: string,
  bloco: Bloco,
): Promise<{ erro: boolean } & object> {
  if (bloco === "hor") return buscarHorariaComRetry(uf);
  if (bloco === "hist") return buscarHistoricoComRetry(uf);
  if (bloco === "atual") return buscarAtualComRetry(uf);
  return buscarPrevisaoComRetry(uf);
}

async function upsertBloco(
  uf: string,
  bloco: Bloco,
  dados: object,
  quando: Date,
): Promise<void> {
  const dias = SENTINELA[bloco];
  await prisma.climaCacheUF.upsert({
    where: { uf_dias: { uf, dias } },
    create: { uf, dias, dados, atualizadoEm: quando },
    update: { dados, atualizadoEm: quando },
  });
}

// Re-busca um bloco em BACKGROUND (sem await no request). Upsert so em sucesso;
// erros capturados aqui — nunca derrubam o processo.
function reconstruirBloco(uf: string, bloco: Bloco): void {
  const chave = `${uf}:${bloco}`;
  if (emReconstrucao.has(chave)) return;
  emReconstrucao.add(chave);
  void (async () => {
    try {
      const r = await buscarBloco(uf, bloco);
      if (!r.erro) await upsertBloco(uf, bloco, r as object, new Date());
    } catch (e) {
      console.error(
        `[clima/estado] reconstrucao ${chave} falhou:`,
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      emReconstrucao.delete(chave);
    }
  })();
}

// Corre `p` contra um teto; null se o teto vencer (o fetch segue em background).
function comTeto<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((res) => setTimeout(() => res(null), ms)),
  ]);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const uf = (req.nextUrl.searchParams.get("uf") ?? "").trim().toUpperCase();
  const cap = CAPITAIS[uf];
  if (!/^[A-Z]{2}$/.test(uf) || !cap) {
    return NextResponse.json({ erro: "uf invalida" }, { status: 400 });
  }
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const agora = Date.now();

  // Ultimo bom de cada bloco (atual/horaria/historico/previsao) desta UF no banco.
  const rows = await prisma.climaCacheUF.findMany({
    where: {
      uf,
      dias: { in: [DIAS_ATUAL, DIAS_HORARIA, DIAS_HISTORICO, DIAS_PREVISAO] },
    },
  });
  const linhaAtual = rows.find((r) => r.dias === DIAS_ATUAL) ?? null;
  const linhaHor = rows.find((r) => r.dias === DIAS_HORARIA) ?? null;
  const linhaHist = rows.find((r) => r.dias === DIAS_HISTORICO) ?? null;
  const linhaPrev = rows.find((r) => r.dias === DIAS_PREVISAO) ?? null;

  const stale = (linha: (typeof rows)[number] | null, ttl: number): boolean =>
    !linha || refresh || agora - linha.atualizadoEm.getTime() > ttl;
  const atualStale = stale(linhaAtual, TTL_ATUAL_MS);
  const horStale = stale(linhaHor, TTL_HORARIA_MS);
  const histStale = stale(linhaHist, TTL_HISTORICO_MS);
  const prevStale = stale(linhaPrev, TTL_PREVISAO_MS);

  // Estado inicial: o cache (mesmo stale). Blocos SEM cache serao buscados agora.
  let atualBloco = (linhaAtual?.dados as unknown as BlocoAtual) ?? null;
  let horBloco = (linhaHor?.dados as unknown as BlocoHoraria) ?? null;
  let horAtualizadoEm = linhaHor?.atualizadoEm ?? null;
  let histBloco = (linhaHist?.dados as unknown as BlocoHistorico) ?? null;
  let histAtualizadoEm = linhaHist?.atualizadoEm ?? null;
  let prevBloco = (linhaPrev?.dados as unknown as BlocoPrevisao) ?? null;
  let prevAtualizadoEm = linhaPrev?.atualizadoEm ?? null;

  // Blocos com cache mas stale -> atualizam em BACKGROUND (respondemos com cache).
  if (linhaAtual && atualStale) reconstruirBloco(uf, "atual");
  if (linhaHor && horStale) reconstruirBloco(uf, "hor");
  if (linhaHist && histStale) reconstruirBloco(uf, "hist");
  if (linhaPrev && prevStale) reconstruirBloco(uf, "prev");

  // Blocos SEM cache -> busca com TETO (precisamos de algo p/ mostrar). O que nao
  // vier a tempo fica vazio e completa em background/proximo request. Cada bloco e
  // INDEPENDENTE: um falhar nao zera os outros.
  const [rAtual, rHor, rHist, rPrev] = await Promise.all([
    linhaAtual
      ? Promise.resolve<null>(null)
      : comTeto(buscarAtualComRetry(uf), TETO_CACHE_VAZIO_MS),
    linhaHor
      ? Promise.resolve<null>(null)
      : comTeto(buscarHorariaComRetry(uf), TETO_CACHE_VAZIO_MS),
    linhaHist
      ? Promise.resolve<null>(null)
      : comTeto(buscarHistoricoComRetry(uf), TETO_CACHE_VAZIO_MS),
    linhaPrev
      ? Promise.resolve<null>(null)
      : comTeto(buscarPrevisaoComRetry(uf), TETO_CACHE_VAZIO_MS),
  ]);
  const nowDate = new Date();

  if (!linhaAtual) {
    if (rAtual && !rAtual.erro) {
      await upsertBloco(uf, "atual", rAtual as object, nowDate);
      atualBloco = rAtual;
    } else {
      reconstruirBloco(uf, "atual");
    }
  }
  if (!linhaHor) {
    if (rHor && !rHor.erro) {
      await upsertBloco(uf, "hor", rHor as object, nowDate);
      horBloco = rHor;
      horAtualizadoEm = nowDate;
    } else {
      reconstruirBloco(uf, "hor"); // timeout/erro -> completa depois
    }
  }
  if (!linhaHist) {
    if (rHist && !rHist.erro) {
      await upsertBloco(uf, "hist", rHist as object, nowDate);
      histBloco = rHist;
      histAtualizadoEm = nowDate;
    } else {
      reconstruirBloco(uf, "hist");
    }
  }
  if (!linhaPrev) {
    if (rPrev && !rPrev.erro) {
      await upsertBloco(uf, "prev", rPrev as object, nowDate);
      prevBloco = rPrev;
      prevAtualizadoEm = nowDate;
    } else {
      reconstruirBloco(uf, "prev");
    }
  }

  const historico = histBloco?.historico ?? [];
  const previsao = prevBloco?.previsao ?? [];
  // "agora" vem do bloco atual (independente); cai para o atual da previsao se
  // por acaso existir num cache antigo. Nunca depende do sucesso da previsao 16d.
  const climaAtual = atualBloco?.atual ?? prevBloco?.atual ?? null;
  const resp: DetalheClimaResp = {
    uf,
    capital: cap.capital,
    fonte: "Open-Meteo",
    atual: climaAtual,
    horarioHoje: horBloco?.horarioHoje ?? [],
    horarioAtualizadoEm: horAtualizadoEm ? horAtualizadoEm.toISOString() : null,
    horarioErro: !horBloco || horBloco.horarioHoje.length === 0,
    previsao,
    previsaoAtualizadoEm: prevAtualizadoEm ? prevAtualizadoEm.toISOString() : null,
    previsaoErro: !prevBloco || previsao.length === 0,
    historico,
    historicoAtualizadoEm: histAtualizadoEm ? histAtualizadoEm.toISOString() : null,
    historicoErro: !histBloco || historico.length === 0,
    tendencia: calcularTendencia(historico),
  };
  return NextResponse.json(resp);
}

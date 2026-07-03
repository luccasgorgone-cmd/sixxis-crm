// Inteligencia Regional: DETALHE de clima de um estado (drill-down do drawer).
// FONTE UNICA LEVE: uma query horaria estendida (7 dias, hora a hora) da qual
// derivamos o CLIMA ATUAL, a CURVA 24H e a PREVISAO DIARIA de 7 dias — eliminando
// as queries pesadas (daily 16d / &current=) que davam timeout a partir do IP do
// Railway. HISTORICO (~30d) vem do archive (leve). Cache PERSISTENTE por UF em
// ClimaCacheUF: -1 horaria, -2 historico.
//
// STALE-WHILE-REVALIDATE: responde NA HORA com o cache (mesmo stale) e re-busca o
// que esta stale em BACKGROUND. So bloqueia (com TETO ~8s) quando um bloco NAO tem
// NENHUM cache. Cada bloco e independente: um falhar nao zera os outros.
// GET /api/inteligencia/clima/estado?uf=XX  (agente logado)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { CAPITAIS } from "@/lib/capitais";
import {
  TTL_HORARIA_MS,
  TTL_HISTORICO_MS,
  TTL_UV_MS,
  DIAS_HORARIA,
  DIAS_HISTORICO,
  DIAS_UV,
  buscarHorariaComRetry,
  buscarHistoricoComRetry,
  buscarUvComRetry,
  derivarAtual,
  derivarPrevisaoDiaria,
  calcularTendencia,
  type BlocoHoraria,
  type BlocoHistorico,
  type BlocoUv,
  type DetalheClimaResp,
} from "@/lib/clima-estado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TETO_CACHE_VAZIO_MS = 8_000;

// Lock por (uf:bloco) evita reconstrucoes concorrentes do mesmo dado.
const emReconstrucao = new Set<string>();

type Bloco = "hor" | "hist" | "uv";
const SENTINELA: Record<Bloco, number> = {
  hor: DIAS_HORARIA,
  hist: DIAS_HISTORICO,
  uv: DIAS_UV,
};

async function buscarBloco(
  uf: string,
  bloco: Bloco,
): Promise<{ erro: boolean } & object> {
  if (bloco === "hor") return buscarHorariaComRetry(uf);
  if (bloco === "uv") return buscarUvComRetry(uf);
  return buscarHistoricoComRetry(uf);
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

  // Ultimo bom de cada bloco (horaria/historico/uv) desta UF no banco.
  const rows = await prisma.climaCacheUF.findMany({
    where: { uf, dias: { in: [DIAS_HORARIA, DIAS_HISTORICO, DIAS_UV] } },
  });
  const linhaHor = rows.find((r) => r.dias === DIAS_HORARIA) ?? null;
  const linhaHist = rows.find((r) => r.dias === DIAS_HISTORICO) ?? null;
  const linhaUv = rows.find((r) => r.dias === DIAS_UV) ?? null;

  const stale = (linha: (typeof rows)[number] | null, ttl: number): boolean =>
    !linha || refresh || agora - linha.atualizadoEm.getTime() > ttl;
  const horStale = stale(linhaHor, TTL_HORARIA_MS);
  const histStale = stale(linhaHist, TTL_HISTORICO_MS);
  const uvStale = stale(linhaUv, TTL_UV_MS);

  // Estado inicial: o cache (mesmo stale). Blocos SEM cache serao buscados agora.
  let horBloco = (linhaHor?.dados as unknown as BlocoHoraria) ?? null;
  let horAtualizadoEm = linhaHor?.atualizadoEm ?? null;
  let histBloco = (linhaHist?.dados as unknown as BlocoHistorico) ?? null;
  let histAtualizadoEm = linhaHist?.atualizadoEm ?? null;
  const uvBloco = (linhaUv?.dados as unknown as BlocoUv) ?? null;

  // Blocos com cache mas stale -> atualizam em BACKGROUND (respondemos com cache).
  if (linhaHor && horStale) reconstruirBloco(uf, "hor");
  if (linhaHist && histStale) reconstruirBloco(uf, "hist");
  // UV e OPCIONAL e NAO-BLOQUEANTE: sempre em background (nunca segura a resposta).
  if (uvStale) reconstruirBloco(uf, "uv");

  // Blocos SEM cache -> busca com TETO (precisamos de algo p/ mostrar). O que nao
  // vier a tempo fica vazio e completa em background/proximo request.
  const [rHor, rHist] = await Promise.all([
    linhaHor
      ? Promise.resolve<null>(null)
      : comTeto(buscarHorariaComRetry(uf), TETO_CACHE_VAZIO_MS),
    linhaHist
      ? Promise.resolve<null>(null)
      : comTeto(buscarHistoricoComRetry(uf), TETO_CACHE_VAZIO_MS),
  ]);
  const nowDate = new Date();

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

  // DERIVADOS da horaria (fonte unica): atual, curva 24h e previsao 7 dias.
  const atual = horBloco ? derivarAtual(horBloco) : null;
  const previsaoBase = horBloco ? derivarPrevisaoDiaria(horBloco) : [];
  // Enriquece com UV do bloco opcional (se veio); senao uv fica null ("—").
  const previsao = previsaoBase.map((p) => ({
    ...p,
    uv: uvBloco?.uvPorDia?.[p.dia] ?? null,
  }));
  const horario24h = horBloco ? horBloco.horarioHoje.slice(0, 24) : [];
  const historico = histBloco?.historico ?? [];

  const resp: DetalheClimaResp = {
    uf,
    capital: cap.capital,
    fonte: "Open-Meteo",
    atual,
    horarioHoje: horario24h,
    horarioAtualizadoEm: horAtualizadoEm ? horAtualizadoEm.toISOString() : null,
    horarioErro: !horBloco || horario24h.length === 0,
    previsao,
    previsaoAtualizadoEm: horAtualizadoEm ? horAtualizadoEm.toISOString() : null,
    previsaoErro: previsao.length === 0,
    historico,
    historicoAtualizadoEm: histAtualizadoEm ? histAtualizadoEm.toISOString() : null,
    historicoErro: !histBloco || historico.length === 0,
    tendencia: calcularTendencia(historico),
  };
  return NextResponse.json(resp);
}

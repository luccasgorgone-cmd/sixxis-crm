// Rate limit por chave: 600 req/min, janela fixa por minuto no Redis.
// Chave Redis: apiv1:rl:<chaveId>:<minutoEpoch>. INCR + EXPIRE 60s.
//
// Fail-open: se o Redis falhar, NAO bloqueia a leitura (um blip de Redis nao
// deve derrubar a API inteira). O limite e protecao contra abuso, nao um gate
// de seguranca de dados — esse papel e da autenticacao + escopos.

import { getRedis } from "@/lib/redis";

export const LIMITE_POR_MINUTO = 600;
const JANELA_SEG = 60;

export interface ResultadoRateLimit {
  permitido: boolean;
  limite: number;
  restante: number;
  // Segundos ate a janela reiniciar.
  resetSeg: number;
}

export async function verificarRateLimit(chaveId: string): Promise<ResultadoRateLimit> {
  const agoraSeg = Math.floor(Date.now() / 1000);
  const minuto = Math.floor(agoraSeg / JANELA_SEG);
  const resetSeg = (minuto + 1) * JANELA_SEG - agoraSeg;
  const redisKey = `apiv1:rl:${chaveId}:${minuto}`;
  try {
    const redis = getRedis();
    const atual = await redis.incr(redisKey);
    if (atual === 1) await redis.expire(redisKey, JANELA_SEG);
    const restante = Math.max(0, LIMITE_POR_MINUTO - atual);
    return {
      permitido: atual <= LIMITE_POR_MINUTO,
      limite: LIMITE_POR_MINUTO,
      restante,
      resetSeg,
    };
  } catch {
    // Fail-open.
    return { permitido: true, limite: LIMITE_POR_MINUTO, restante: LIMITE_POR_MINUTO, resetSeg };
  }
}

// --- falhas de autenticacao por IP (anti brute-force de chaves) --------------
// A autenticacao roda ANTES do rate limit por chave, entao requisicoes com
// Bearer invalido (401) nunca eram contadas. Isto limita falhas de auth por IP
// na mesma janela de 1 minuto no Redis. Chave Redis: apiv1:rl401:<ip>:<minuto>.
// Fail-open (Redis down nao bloqueia nem derruba a auth) e no-op sem IP.
export const LIMITE_FALHAS_AUTH_POR_MINUTO = 60;

export async function registrarFalhaAuth(
  ip: string | null,
): Promise<{ excedido: boolean; resetSeg: number }> {
  const agoraSeg = Math.floor(Date.now() / 1000);
  const minuto = Math.floor(agoraSeg / JANELA_SEG);
  const resetSeg = (minuto + 1) * JANELA_SEG - agoraSeg;
  if (!ip) return { excedido: false, resetSeg };
  const redisKey = `apiv1:rl401:${ip}:${minuto}`;
  try {
    const redis = getRedis();
    const atual = await redis.incr(redisKey);
    if (atual === 1) await redis.expire(redisKey, JANELA_SEG);
    return { excedido: atual > LIMITE_FALHAS_AUTH_POR_MINUTO, resetSeg };
  } catch {
    // Fail-open.
    return { excedido: false, resetSeg };
  }
}

export function cabecalhosRateLimit(r: ResultadoRateLimit): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limite),
    "X-RateLimit-Remaining": String(r.restante),
    "X-RateLimit-Reset": String(r.resetSeg),
  };
}

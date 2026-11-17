// Throttle de FALHAS de autenticacao por IP (anti brute-force de chaves).
// Chave Redis: apiv1:rl401:<ip>:<minutoEpoch>. INCR + EXPIRE 60s.
//
// NAO existe rate limit por chave: uma chave valida e autenticada consulta sem
// teto de requisicoes por minuto (a API de Leitura v1 e read-only, sem segredos,
// e fica conectada direto a um programa externo). A unica protecao de volume que
// resta e o teto por IP de FALHAS de autenticacao — ela nunca afeta a chave boa,
// porque so conta requisicoes que falharam a autenticacao (401).
//
// Fail-open: se o Redis falhar, NAO bloqueia (um blip de Redis nao deve derrubar
// a auth). E no-op sem IP.

import { getRedis } from "@/lib/redis";

const JANELA_SEG = 60;

// Teto de falhas de autenticacao por IP na janela de 1 minuto. A autenticacao
// roda e, a cada Bearer invalido (401), conta a falha por IP. Acima disto o IP
// recebe 429 + Retry-After ANTES de consultar o banco (anti brute-force).
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

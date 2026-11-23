// Regras PURAS da varredura de presenca (sem banco) — travadas pelo contrato
// dourado c27. O cliente manda heartbeat enquanto a aba vive; o servidor derruba
// quem parou de mandar (fechou a aba / dormiu / caiu a rede), tirando do rodizio.

// Intervalo do heartbeat no cliente (ms). O servidor espera varios para nao
// derrubar por causa de 1 batida perdida (throttle de aba em segundo plano).
export const HEARTBEAT_MS = 60_000; // 60s

// Tolerancia sem heartbeat antes de considerar a presenca MORTA e derrubar.
// > HEARTBEAT_MS com folga (aguenta throttling de aba oculta ~1/min).
export const LIMITE_PRESENCA_MS = 5 * 60_000; // 5 min

// Presenca expirou? Verdadeiro so quando ha um heartbeat anterior e ele e mais
// velho que o limite. NULL (nunca bateu) NUNCA expira — conta legada nao e
// derrubada por engano (evita blackout de distribuicao).
export function presencaExpirou(
  ultimaPresencaEm: Date | null | undefined,
  agora: Date,
  limiteMs: number = LIMITE_PRESENCA_MS,
): boolean {
  if (!ultimaPresencaEm) return false;
  return agora.getTime() - ultimaPresencaEm.getTime() > limiteMs;
}

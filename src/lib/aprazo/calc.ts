// "A Prazo": calculos puros do prazo de recontato. Dias CORRIDOS (o prazo do
// mundo real do cliente, ex.: "preciso de 7 dias"), NAO dias uteis. Sem imports
// nem efeitos colaterais — base testavel (contrato c16).

// Minutos de antecedencia do aviso na agenda (24h antes do prazo). O Lembrete usa
// lembrarAntesMin: dá a notificacao "24h antes" (6o dia num prazo de 7) de graca,
// e o proprio Lembrete vence no dia (notificacao "no dia").
export const AVISO_ANTES_MIN = 24 * 60;

// Limites defensivos do prazo em dias.
export const DIAS_MIN = 1;
export const DIAS_MAX = 365;

export function normalizarDias(dias: number): number {
  const d = Math.round(Number(dias));
  if (!Number.isFinite(d)) return DIAS_MIN;
  return Math.min(DIAS_MAX, Math.max(DIAS_MIN, d));
}

// Data em que o dono deve recontatar = agora + N dias corridos.
export function prazoAteDe(agora: Date, dias: number): Date {
  return new Date(agora.getTime() + normalizarDias(dias) * 24 * 60 * 60 * 1000);
}

// O prazo venceu? (base do auto-retorno). null = sem prazo -> nunca vence.
export function prazoVencido(
  prazoAte: Date | null | undefined,
  agora: Date,
): boolean {
  if (!prazoAte) return false;
  return agora.getTime() >= prazoAte.getTime();
}

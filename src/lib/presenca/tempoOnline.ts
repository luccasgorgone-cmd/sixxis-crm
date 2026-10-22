// Tempo-online puro — base da métrica de atendimento por PRESENÇA (substitui a
// ideia de horário comercial fixo). Soma os segundos em que o vendedor esteve
// ONLINE dentro da janela [de, ate]. Determinística, sem banco. Ver
// docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md.

export type PeriodoOnline = { inicio: Date; fim: Date | null };

// Soma a interseção de cada período ONLINE com [de, ate]. `fim=null` = ainda
// online agora -> conta até `ate`. Períodos fora da janela contribuem 0.
export function segundosOnlineEntre(
  periodos: PeriodoOnline[],
  de: Date,
  ate: Date,
): number {
  const janInicio = de.getTime();
  const janFim = ate.getTime();
  if (janFim <= janInicio) return 0;

  let ms = 0;
  for (const p of periodos) {
    const ini = p.inicio.getTime();
    const fim = p.fim === null ? janFim : p.fim.getTime();
    const inicioInter = Math.max(ini, janInicio);
    const fimInter = Math.min(fim, janFim);
    if (fimInter > inicioInter) ms += fimInter - inicioInter;
  }
  return Math.round(ms / 1000);
}

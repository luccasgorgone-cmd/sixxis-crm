// Tempo de 1a resposta por PRESENCA — media (em segundos) do tempo em que o
// vendedor DONO esteve ONLINE entre o 1o contato do cliente (1o IN) e a 1a
// resposta (1o OUT). Puro, sem banco. Ver docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md
// e docs/superpowers/plans/2026-10-22-metrica-tempo-online.md.
//
// Regra de fallback (passado nunca regride): o rastreamento de presenca comecou
// num CUTOVER global (`presencaAtivaDesde` = MIN(inicioEm) de PresencaPeriodo).
// Uma conversa cuja 1a resposta (fo) aconteceu ANTES do cutover — ou sem dono —
// nao tem como ter dado de presenca, entao cai no DELTA CRU (wall-clock), igual
// a metrica de hoje. Depois do cutover, usa o tempo online real do dono (que
// pode ser 0 se ele estava offline naquele intervalo — "offline nao conta").
import { segundosOnlineEntre, type PeriodoOnline } from "./tempoOnline";

export type ConversaResp = { agenteId: string | null; fi: Date; fo: Date };

export function mediaPrimeiraRespostaOnline(
  conversas: ConversaResp[],
  periodosPorAgente: Map<string, PeriodoOnline[]>,
  presencaAtivaDesde: Date | null,
): number {
  const cutover = presencaAtivaDesde ? presencaAtivaDesde.getTime() : null;

  let somaSeg = 0;
  let n = 0;
  for (const c of conversas) {
    const wallSeg = (c.fo.getTime() - c.fi.getTime()) / 1000;
    if (wallSeg <= 0) continue; // mesmo denominador de hoje: so fo > fi

    const rastreado =
      cutover !== null && c.agenteId !== null && c.fo.getTime() > cutover;

    let seg: number;
    if (rastreado) {
      const periodos = periodosPorAgente.get(c.agenteId as string) ?? [];
      // segundosOnlineEntre ja arredonda; para a media isso e desprezivel.
      seg = segundosOnlineEntre(periodos, c.fi, c.fo);
    } else {
      // Fallback: antes do rastreamento ou sem dono -> delta cru (float, para
      // casar com o AVG(EXTRACT(EPOCH ...)) antigo no caso 100% passado).
      seg = wallSeg;
    }

    somaSeg += seg;
    n += 1;
  }

  return n > 0 ? Math.round(somaSeg / n) : 0;
}

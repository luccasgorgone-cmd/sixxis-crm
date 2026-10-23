// Tempo de 1a resposta por PRESENCA — segundos em que o vendedor DONO esteve
// ONLINE entre o 1o contato do cliente (1o IN) e a 1a resposta (1o OUT). Puro,
// sem banco. FONTE ÚNICA consumida pela media (metricas.ts) e pelo % no prazo +
// histograma (indicadores.ts). Ver docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md e
// docs/superpowers/plans/2026-10-22-metrica-tempo-online.md.
//
// Regra de fallback (passado nunca regride): o rastreamento comecou num CUTOVER
// global (`presencaAtivaDesde` = MIN(inicioEm) de PresencaPeriodo). Conversa cuja
// 1a resposta (fo) aconteceu ANTES do cutover — ou sem dono, ou sem rastreamento
// nenhum (cutover null) — cai no DELTA CRU (wall-clock), igual a metrica antiga.
// Depois do cutover usa o tempo online real do dono (0 se estava offline naquele
// intervalo — "offline nao conta").
import { segundosOnlineEntre, type PeriodoOnline } from "./tempoOnline";

export type ConversaResp = { agenteId: string | null; fi: Date; fo: Date };

// Segundos de 1a resposta POR CONVERSA (online do dono, com fallback wall-clock).
// So conversas com fo > fi (mesmo denominador de hoje).
export function segundos1aRespostaPorConversa(
  conversas: ConversaResp[],
  periodosPorAgente: Map<string, PeriodoOnline[]>,
  presencaAtivaDesde: Date | null,
): number[] {
  const cutover = presencaAtivaDesde ? presencaAtivaDesde.getTime() : null;
  const out: number[] = [];
  for (const c of conversas) {
    const wallSeg = (c.fo.getTime() - c.fi.getTime()) / 1000;
    if (wallSeg <= 0) continue;

    const rastreado =
      cutover !== null && c.agenteId !== null && c.fo.getTime() > cutover;
    if (rastreado) {
      const periodos = periodosPorAgente.get(c.agenteId as string) ?? [];
      out.push(segundosOnlineEntre(periodos, c.fi, c.fo));
    } else {
      out.push(wallSeg);
    }
  }
  return out;
}

// Media (segundos, arredondada) de uma lista de tempos; 0 se vazia. Casa com o
// AVG(EXTRACT(EPOCH ...)) antigo no caso 100% fallback (media de floats, 1 round).
export function mediaSegundos(temposSeg: number[]): number {
  if (temposSeg.length === 0) return 0;
  const soma = temposSeg.reduce((a, b) => a + b, 0);
  return Math.round(soma / temposSeg.length);
}

// MEDIANA (não média) dos tempos (segundos). O Manual (KPIs) pede explicitamente a
// mediana da 1ª resposta — robusta a outliers. 0 se vazio.
export function medianaSegundos(temposSeg: number[]): number {
  if (temposSeg.length === 0) return 0;
  const ord = [...temposSeg].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2
    ? Math.round(ord[meio])
    : Math.round((ord[meio - 1] + ord[meio]) / 2);
}

// Fração dos tempos (segundos) dentro de um limiar. Base do "% 1º contato ≤ X".
export function pctDentro(temposSeg: number[], limiarSeg: number): number {
  if (temposSeg.length === 0) return 0;
  return temposSeg.filter((t) => t <= limiarSeg).length / temposSeg.length;
}

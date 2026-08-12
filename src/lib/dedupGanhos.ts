// REGRA da deduplicacao de ganhos repetidos (Fatia 9), separada da rota que a
// aplica. Sem prisma, sem I/O: so o criterio. Fica aqui para poder ser lido e
// testado sozinho — e o pedaco desta fatia que decide o que e venda real e o que
// e repeticao de movimentacao do card, entao merece viver longe do encanamento.
//
// Ver /api/admin/dedup-ganhos para o que e feito com o resultado.

// Janela do mesmo ciclo de venda. Movimentar o card para frente e para tras
// acontece em minutos ou horas; recompra de verdade leva dias. 24h separa os
// dois casos com folga dos dois lados.
export const JANELA_HORAS = 24;
const JANELA_MS = JANELA_HORAS * 60 * 60 * 1000;

export const CRITERIO_DEDUP =
  `eventos GANHO do mesmo negocio dentro de ${JANELA_HORAS}h ` +
  `a partir do primeiro do ciclo`;

export type Ciclo<T> = { mantido: T; repetidos: T[] };

// Agrupa os eventos de UM negocio em ciclos de venda. ESPERA os eventos
// ordenados por criadoEm ASC.
//
// A janela conta do PRIMEIRO evento do ciclo, nao do anterior. Encadear pelo
// anterior deixaria uma corrente longa colapsar sem limite (um ganho a cada 20h
// por um mes viraria uma compra so). Ancorada no primeiro, um ciclo cobre no
// maximo JANELA_HORAS — e uma recompra de verdade, que vem dias depois, abre
// ciclo novo e continua contando como compra.
export function agruparEmCiclos<T extends { criadoEm: Date }>(
  eventos: T[],
): Ciclo<T>[] {
  const ciclos: Ciclo<T>[] = [];
  for (const e of eventos) {
    const atual = ciclos[ciclos.length - 1];
    const dentro =
      atual != null &&
      e.criadoEm.getTime() - atual.mantido.criadoEm.getTime() <= JANELA_MS;
    if (dentro) atual.repetidos.push(e);
    else ciclos.push({ mantido: e, repetidos: [] });
  }
  return ciclos;
}

// vezesGanho corrigido. SO PARA MENOS: o contador so e incrementado na transicao
// de verdade, mas um PATCH em negocio JA ganho grava evento sem incrementar —
// entao existem negocios com mais eventos do que vezesGanho. Escrever o numero
// de ciclos cru poderia AUMENTAR o contador em algum desses, que e o oposto do
// que esta fatia veio fazer. O clamp garante que a limpeza so desinfla.
export function vezesGanhoCorrigido(ciclos: number, atual: number): number {
  return Math.min(ciclos, atual);
}

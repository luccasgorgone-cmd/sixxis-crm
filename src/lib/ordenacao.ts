// Fatia Y: fonte UNICA da regra "fixadas primeiro". O pin (Conversa.fixadaEm)
// tem prioridade sobre o criterio natural de cada tela — no Inbox a recencia
// (ultimaMensagemEm), no Kanban a entrada na etapa (entrouEtapaEm). Aqui fica so
// a precedencia do pin; cada tela aplica o seu tiebreaker por cima.

import type { Prisma } from "@/generated/prisma/client";

// orderBy para a listagem de conversas do Inbox (nivel banco): fixadas primeiro
// (fixadaEm mais recente; sem pin por ultimo), depois recencia da conversa.
export const ordemConversas: Prisma.ConversaOrderByWithRelationInput[] = [
  { fixadaEm: { sort: "desc", nulls: "last" } },
  { ultimaMensagemEm: "desc" },
  { criadoEm: "desc" },
];

// Comparador de "pin primeiro" para ordenar em memoria (Kanban / lista no
// cliente). Aceita Date, string ISO ou null. fixadaEm mais recente vem antes;
// sem pin (null) por ultimo. Retorna 0 no empate para o tiebreaker da tela
// decidir (Array.sort e estavel, entao a ordem previa e preservada).
export function compararPin(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): number {
  const ta = a ? new Date(a).getTime() : null;
  const tb = b ? new Date(b).getTime() : null;
  if (ta !== null && tb !== null) return tb - ta;
  if (ta !== null) return -1;
  if (tb !== null) return 1;
  return 0;
}

// Ordenacao da LISTA do Inbox (em memoria, no cliente). NAO e usada pelo Kanban —
// o Kanban ordena por etapa/entrouEtapaEm e nao passa por aqui. Regra:
//   1) fixadas primeiro (pin);
//   2) "aguardando resposta nossa" (ultima mensagem foi do CLIENTE, direcao IN)
//      ACIMA de "aguardando o cliente" (ultima mensagem foi NOSSA, direcao OUT) —
//      asim, quando o atendente responde, a conversa AFUNDA para baixo de todas as
//      que ainda esperam resposta; quando o cliente escreve, ela SOBE;
//   3) dentro de "aguardando nos": quem espera ha MAIS TEMPO primeiro (fila justa,
//      o cliente mais antigo sem resposta fica no topo);
//   4) dentro de "aguardando o cliente": mais recente primeiro (recencia normal).
// Direcao ausente (uso embutido / conversa sem mensagem) conta como "aguardando
// nos" (camada 0).
export type OrdemInbox = {
  fixadaEm?: Date | string | null;
  ultimaMensagemEm?: Date | string | null;
  ultimaDirecao?: "IN" | "OUT" | null;
};

function camadaInbox(c: OrdemInbox): 0 | 1 {
  return c.ultimaDirecao === "OUT" ? 1 : 0;
}

function emMs(v: Date | string | null | undefined): number {
  return v ? new Date(v).getTime() : 0;
}

export function compararConversasInbox(a: OrdemInbox, b: OrdemInbox): number {
  const p = compararPin(a.fixadaEm, b.fixadaEm);
  if (p !== 0) return p;
  const ca = camadaInbox(a);
  const cb = camadaInbox(b);
  if (ca !== cb) return ca - cb; // camada 0 (aguardando nos) antes da 1
  const ma = emMs(a.ultimaMensagemEm);
  const mb = emMs(b.ultimaMensagemEm);
  // Aguardando nos: ascendente (mais antigo no topo). Aguardando cliente: desc.
  return ca === 0 ? ma - mb : mb - ma;
}

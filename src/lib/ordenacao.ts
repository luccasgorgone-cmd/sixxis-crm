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

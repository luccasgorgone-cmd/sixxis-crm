// Status da assistencia (aba Local) — ordem e metadados (rotulo + classe de cor).
// Compartilhado entre a aba Local e o bloco de assistencia na ficha do cliente.
export const STATUS_ORDEM = [
  "RECEBIDO",
  "EM_ANALISE",
  "EM_REPARO",
  "AGUARDANDO_PECA",
  "PRONTO",
  "ENTREGUE",
] as const;

export const STATUS_META: Record<string, { rotulo: string; classe: string }> = {
  RECEBIDO: { rotulo: "Recebido", classe: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  EM_ANALISE: { rotulo: "Em analise", classe: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  EM_REPARO: { rotulo: "Em reparo", classe: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  AGUARDANDO_PECA: { rotulo: "Aguardando peca", classe: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  PRONTO: { rotulo: "Pronto", classe: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  ENTREGUE: { rotulo: "Entregue", classe: "bg-black/5 text-medio/70" },
};

// Um item em assistencia esta "aberto" enquanto nao foi entregue.
export function assistenciaAberta(status: string): boolean {
  return status !== "ENTREGUE";
}

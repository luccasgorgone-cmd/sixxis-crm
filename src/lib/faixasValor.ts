// FAIXAS DE VALOR GASTO — definicao unica, usada pelo back-end (filtro) e pela
// UI (opcoes do select). Fica FORA de lib/compras porque aquele modulo importa o
// prisma: um componente de cliente que importasse as faixas de la arrastaria o
// banco para o bundle do navegador. Aqui nao ha import nenhum, entao serve aos
// dois lados.
//
// Semantica: "ACIMA DE" e estrito (>). "Acima de R$ 5 mil" NAO inclui quem
// gastou exatamente 5.000 — quem gastou 5.000 nao gastou acima de 5.000. Como o
// filtro existe para achar quem passa de um patamar, o > e o que o dono espera
// ao ler o rotulo; o = fica de fora e nunca aparece em duas faixas.
export const FAIXAS_VALOR_GASTO = [5000, 10000, 20000, 50000, 100000] as const;

export type FaixaValorGasto = (typeof FAIXAS_VALOR_GASTO)[number];

// Rotulo curto em "mil" (5000 -> "Acima de R$ 5 mil"), como o dono pediu.
export function rotuloFaixaValor(valor: number): string {
  return `Acima de R$ ${valor / 1000} mil`;
}

// Le o parametro valorMin da query. Devolve null (= sem filtro) para ausente,
// vazio, nao-numerico ou <= 0, para um parametro estranho nunca esvaziar a lista
// nem virar erro. Nao exige ser uma das FAIXAS: qualquer piso positivo vale, e
// as faixas sao so o que a UI oferece.
export function lerValorMin(bruto: string | null): number | null {
  if (!bruto) return null;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// Passa no filtro? Fonte unica da comparacao, para o back-end e a UI nunca
// divergirem no criterio (> e nao >=).
export function passaValorMin(
  totalGasto: number,
  valorMin: number | null,
): boolean {
  if (valorMin == null) return true;
  return totalGasto > valorMin;
}

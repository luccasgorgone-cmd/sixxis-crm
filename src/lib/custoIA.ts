// SOL-2: preco por modelo e custo estimado de uma decisao da Sol.
//
// COTACAO: 2026-06-24 (tabela oficial da Anthropic, precos por MILHAO de tokens,
// em DOLAR). Sao os precos de API primeira-parte. Ao trocar o modelo da Sol para
// um que nao esteja aqui, ACRESCENTE a linha — nao chute: sem entrada na tabela o
// custo fica null de proposito (ver custoEstimado abaixo).
//
// MOEDA: os valores sao em USD, como a Anthropic cobra. Nao convertemos para BRL
// porque isso exigiria uma cotacao de cambio que nao temos — a UI rotula "US$".
const PRECO_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "claude-haiku-4-5": { entrada: 1.0, saida: 5.0 },
  "claude-sonnet-4-6": { entrada: 3.0, saida: 15.0 },
  "claude-opus-4-8": { entrada: 5.0, saida: 25.0 },
};

export function modeloTemPreco(modelo: string | null | undefined): boolean {
  return !!modelo && modelo in PRECO_POR_MILHAO;
}

// Custo em USD de uma decisao. Devolve null quando o modelo NAO esta na tabela:
// e melhor o dashboard mostrar "sem preco para o modelo X" do que exibir um
// numero inventado. Tokens continuam gravados nesse caso.
export function custoEstimado(
  modelo: string | null | undefined,
  tokensEntrada: number,
  tokensSaida: number,
): number | null {
  if (!modelo) return null;
  const p = PRECO_POR_MILHAO[modelo];
  if (!p) return null;
  const bruto =
    (tokensEntrada / 1_000_000) * p.entrada + (tokensSaida / 1_000_000) * p.saida;
  // Decimal(10,5) no banco: arredonda no mesmo lugar para o que gravamos ser
  // exatamente o que somamos.
  return Math.round(bruto * 100_000) / 100_000;
}

// Modelos com preco conhecido — usado pelo dashboard para avisar quando ha
// eventos de um modelo fora da tabela (custo subestimado).
export function modelosComPreco(): string[] {
  return Object.keys(PRECO_POR_MILHAO);
}

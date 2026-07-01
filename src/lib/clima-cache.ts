// Cache em memoria (por processo) do clima da Inteligencia Regional. Chave pelo
// numero de dias (7 ou 14). TTL de 3h: a previsao muda pouco dentro desse
// intervalo e evita marretar a Open-Meteo a cada carregamento da tela.

export type ClimaUF = {
  uf: string;
  tempAtual: number | null;
  sensacao: number | null;
  umidade: number | null;
  chuvaAgora: number | null;
  tempMax: number | null;
  tempMin: number | null;
  chuvaPrevista: number | null;
  umidadeMax: number | null;
  indiceOportunidade: number | null;
  erro: boolean;
};

export type ClimaResultado = {
  dias: number;
  atualizadoEm: string; // ISO do fetch
  fonte: string;
  porUF: ClimaUF[];
};

type Entrada = { dados: ClimaResultado; ts: number };

const TTL_MS = 3 * 60 * 60 * 1000; // 3h
const cache = new Map<number, Entrada>();

// Retorna os dados em cache se ainda validos (dentro do TTL); senao null.
export function obterCache(dias: number): ClimaResultado | null {
  const e = cache.get(dias);
  if (!e) return null;
  if (Date.now() - e.ts > TTL_MS) {
    cache.delete(dias);
    return null;
  }
  return e.dados;
}

// Grava (ou regrava) o resultado no cache com timestamp atual.
export function gravarCache(dias: number, dados: ClimaResultado): void {
  cache.set(dias, { dados, ts: Date.now() });
}

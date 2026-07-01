// Tipos e utilitarios compartilhados da Inteligencia Regional (client).

// Resposta de GET /api/inteligencia/regioes
export type RegiaoUF = {
  uf: string;
  estado: string;
  regiao: string;
  clientes: number;
  vendas: number;
  faturamento: number;
};
export type RegioesResp = {
  porUF: RegiaoUF[];
  porRegiao: { regiao: string; clientes: number; vendas: number; faturamento: number }[];
  total: { clientes: number; vendas: number; faturamento: number };
  semUF: number;
};

// Resposta de GET /api/inteligencia/clima
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
  // Cache persistente por UF: quando foi atualizado e se passou de 3h (stale).
  atualizadoEm: string | null;
  stale: boolean;
};
export type ClimaResp = {
  dias: number;
  atualizadoEm: string | null;
  fonte: string;
  porUF: ClimaUF[];
};

// Cliente na lista por estado (GET /api/inteligencia/clientes?uf=XX).
export type ClienteEstado = {
  leadId: string;
  nome: string;
  telefone: string;
  temperatura: "QUENTE" | "MORNO" | "FRIO" | null;
  status: "ABERTO" | "GANHO" | "PERDIDO" | "PENDENTE" | null;
  valorAberto: number;
  ultimoContato: string | null;
  negocioId: string | null;
  conversaId: string | null;
};
export type ClientesEstadoResp = {
  uf: string;
  estado: string;
  total: number;
  clientes: ClienteEstado[];
};

export type Categoria = "CLIMATIZADOR" | "SPINNING" | "ASPIRADOR";

export const CATEGORIAS: { chave: Categoria; rotulo: string }[] = [
  { chave: "CLIMATIZADOR", rotulo: "Climatizador" },
  { chave: "SPINNING", rotulo: "Spinning" },
  { chave: "ASPIRADOR", rotulo: "Aspirador" },
];

// Metrica ativa no mapa para categorias sem clima (Spinning/Aspirador).
export type MetricaBase = "clientes" | "vendas";

// Interpolacao linear entre stops [t(0..1), "#rrggbb"] -> "#rrggbb".
function hexParaRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbParaHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function corEscala(t: number, stops: [number, string][]): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (x >= t0 && x <= t1) {
      const f = t1 === t0 ? 0 : (x - t0) / (t1 - t0);
      const a = hexParaRgb(c0);
      const b = hexParaRgb(c1);
      return rgbParaHex(
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
      );
    }
  }
  return stops[stops.length - 1][1];
}

// Escala do indice de oportunidade (climatizador): frio -> tiffany -> quente.
export const ESCALA_INDICE: [number, string][] = [
  [0, "#5b7a76"],
  [0.35, "#3cbfb3"],
  [0.65, "#f59e0b"],
  [1, "#dc2626"],
];
// Escala de densidade de clientes/vendas: tiffany claro -> escuro.
export const ESCALA_DENSIDADE: [number, string][] = [
  [0, "#e2f4f1"],
  [0.5, "#3cbfb3"],
  [1, "#12433d"],
];

// Cinza neutro para UF sem dado (usa currentColor-independent; funciona nos 2 temas).
export const COR_SEM_DADO = "#c2ccca";

export const NOME_REGIAO_ORDEM = [
  "Norte",
  "Nordeste",
  "Centro-Oeste",
  "Sudeste",
  "Sul",
];

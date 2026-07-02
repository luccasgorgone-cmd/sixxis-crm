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

// Resposta de GET /api/inteligencia/clima/estado?uf=XX (drill-down).
export type PontoHora = { hora: string; temp: number | null; umidade: number | null };
export type PontoDia = {
  dia: string;
  tempMax: number | null;
  tempMin: number | null;
  chuva: number | null;
};
export type Tendencia = "esquentando" | "esfriando" | "estavel";
export type DetalheClimaResp = {
  uf: string;
  capital: string;
  fonte: string;
  horarioHoje: PontoHora[];
  horarioAtualizadoEm: string | null;
  horarioErro: boolean;
  historico: PontoDia[];
  historicoAtualizadoEm: string | null;
  historicoErro: boolean;
  tendencia: Tendencia | null;
};

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

// CSS linear-gradient (horizontal) a partir dos stops de uma escala. Usado pela
// LegendaGradiente para bater exatamente com as cores do mapa.
export function gradienteCss(stops: [number, string][]): string {
  const partes = stops.map(([t, c]) => `${c} ${Math.round(t * 100)}%`);
  return `linear-gradient(90deg,${partes.join(",")})`;
}

export const NOME_REGIAO_ORDEM = [
  "Norte",
  "Nordeste",
  "Centro-Oeste",
  "Sudeste",
  "Sul",
];

// ---- Filtros de faixa (modo Climatizador) ----
// Multi-select por dimensao; recolorem/atenuam o mapa (dim nos que nao batem).
export type FaixaTemp = "alta" | "media" | "baixa";
export type FaixaUmid = "alta" | "media" | "baixa";
export type FaixaChuva = "com" | "sem";
export type FaixaSensacao = "alta" | "media" | "baixa";
export type FaixaIndice = "alto" | "medio" | "baixo";
export type FiltrosClima = {
  temp: FaixaTemp[];
  umidade: FaixaUmid[];
  chuva: FaixaChuva[];
  sensacao: FaixaSensacao[];
  indice: FaixaIndice[];
};
export const FILTROS_VAZIO: FiltrosClima = {
  temp: [],
  umidade: [],
  chuva: [],
  sensacao: [],
  indice: [],
};

// Faixa de cada dimensao (null = sem dado). Temp sobre tempMax; umidade sobre a
// umidade atual; chuva sobre a chuva prevista do periodo.
export function faixaDeTemp(tempMax: number | null): FaixaTemp | null {
  if (tempMax == null) return null;
  if (tempMax > 30) return "alta";
  if (tempMax >= 22) return "media";
  return "baixa";
}
export function faixaDeUmid(umidade: number | null): FaixaUmid | null {
  if (umidade == null) return null;
  if (umidade > 70) return "alta";
  if (umidade >= 40) return "media";
  return "baixa";
}
export function faixaDeChuva(chuvaPrevista: number | null): FaixaChuva | null {
  if (chuvaPrevista == null) return null;
  return chuvaPrevista > 0 ? "com" : "sem";
}
// Sensacao termica: usa `sensacao`; se null, cai para tempMax (aproximacao).
export function faixaDeSensacao(
  sensacao: number | null,
  tempMax: number | null,
): FaixaSensacao | null {
  const v = sensacao ?? tempMax;
  if (v == null) return null;
  if (v > 32) return "alta";
  if (v >= 24) return "media";
  return "baixa";
}
// Indice de oportunidade PROPRIETARIO da Sixxis (calor + seco + sem chuva).
export function faixaDeIndice(indice: number | null): FaixaIndice | null {
  if (indice == null) return null;
  if (indice >= 70) return "alto";
  if (indice >= 40) return "medio";
  return "baixo";
}

export function algumFiltroAtivo(f: FiltrosClima): boolean {
  return (
    f.temp.length +
      f.umidade.length +
      f.chuva.length +
      f.sensacao.length +
      f.indice.length >
    0
  );
}

// AND entre grupos ativos, OR dentro do grupo. UF sem dado na dimensao ativa
// nao bate. Retorna true quando nao ha filtro ativo naquele grupo.
export function combinaFiltros(c: ClimaUF, f: FiltrosClima): boolean {
  if (f.temp.length) {
    const t = faixaDeTemp(c.tempMax);
    if (!t || !f.temp.includes(t)) return false;
  }
  if (f.umidade.length) {
    const u = faixaDeUmid(c.umidade);
    if (!u || !f.umidade.includes(u)) return false;
  }
  if (f.chuva.length) {
    const ch = faixaDeChuva(c.chuvaPrevista);
    if (!ch || !f.chuva.includes(ch)) return false;
  }
  if (f.sensacao.length) {
    const s = faixaDeSensacao(c.sensacao, c.tempMax);
    if (!s || !f.sensacao.includes(s)) return false;
  }
  if (f.indice.length) {
    const i = faixaDeIndice(c.indiceOportunidade);
    if (!i || !f.indice.includes(i)) return false;
  }
  return true;
}

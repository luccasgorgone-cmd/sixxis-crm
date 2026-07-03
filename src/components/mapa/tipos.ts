// Tipos e config do Mapa (client). Espelham as respostas de /api/mapa/*.
// A escala de cor e a de densidade da Inteligencia (tiffany claro -> escuro).
import { formatarBRL } from "@/lib/format";
import { paramsEscopo } from "@/lib/escopo";

export type ProdutoTop = { rotulo: string; qtd: number };

export type ResumoUF = {
  uf: string;
  estado: string;
  regiao: string;
  clientes: number;
  porTemperatura: { quente: number; morno: number; frio: number };
  negocios: { abertos: number; ganhos: number; perdidos: number };
  valorAberto: number;
  faturamento: number;
  ticketMedio: number | null;
  populacao: number | null;
  clientesPor100k: number | null;
  produtosTop: ProdutoTop[];
  porSegmento: { varejo: number; atacado: number; naoDefinido: number };
  novosPorMes: { ultimos30: number; ultimos90: number };
  ultimoContato: string | null;
};

export type EstadosResp = {
  porUF: ResumoUF[];
  totais: {
    clientes: number;
    abertos: number;
    ganhos: number;
    perdidos: number;
    valorAberto: number;
    faturamento: number;
  };
  semUF: number;
  fontePopulacao: string;
};

export type ClienteMapa = {
  leadId: string;
  negocioId: string | null;
  conversaId: string | null;
  nome: string;
  telefone: string;
  temperatura: "QUENTE" | "MORNO" | "FRIO" | null;
  // Finalidade do negocio principal (para ocultar temperatura na pos-venda).
  finalidade: "VENDA" | "POS_VENDA" | null;
  // Garantia do cliente (pos-venda): null=nao definido, true=com, false=sem.
  garantia: boolean | null;
  segmento: "VAREJO" | "ATACADO" | null;
  status: "ABERTO" | "GANHO" | "PERDIDO" | "PENDENTE" | null;
  etapa: string | null;
  etapaId: string | null;
  valorAberto: number;
  produtoClassificado: string;
  origem: string | null;
  anuncioTitulo: string | null;
  cidade: string | null;
  criadoEm: string;
  ultimoContato: string | null;
  totalCompras: number;
  valorComprado: number;
  motivoPerda: string | null;
};

export type EstadoDetalheResp = {
  uf: string;
  resumo: ResumoUF;
  total: number;
  clientes: ClienteMapa[];
  topCompradores: ClienteMapa[];
  recorrentes: ClienteMapa[];
  perdidos: ClienteMapa[];
  pendentes: ClienteMapa[];
};

// ---- Metrica que colore o choropleth ----
export type MetricaMapa =
  | "clientes"
  | "vendas"
  | "perdidos"
  | "valorAberto"
  | "clientesPor100k";

export type FormatoMetrica = "num" | "brl" | "dec";

export const METRICAS: {
  chave: MetricaMapa;
  rotulo: string;
  valor: (r: ResumoUF) => number | null;
  formato: FormatoMetrica;
  dica?: string;
}[] = [
  { chave: "clientes", rotulo: "Clientes", valor: (r) => r.clientes, formato: "num" },
  { chave: "vendas", rotulo: "Vendas", valor: (r) => r.negocios.ganhos, formato: "num" },
  { chave: "perdidos", rotulo: "Perdidos", valor: (r) => r.negocios.perdidos, formato: "num" },
  {
    chave: "valorAberto",
    rotulo: "Valor em aberto",
    valor: (r) => r.valorAberto,
    formato: "brl",
  },
  {
    chave: "clientesPor100k",
    rotulo: "Clientes / 100k hab.",
    valor: (r) => r.clientesPor100k,
    formato: "dec",
    dica: "Clientes a cada 100 mil habitantes — cruza seus clientes com a populacao do estado (IBGE) para revelar potencial de mercado, nao so volume absoluto.",
  },
];

// Cores Sixxis por categoria de produto (tonalidades tiffany + cinza honesto
// para os nao classificados). Usadas no breakdown de produtos por estado.
export const CORES_PRODUTO: Record<string, string> = {
  Climatizador: "#3cbfb3",
  "Bike Spinning": "#2aa79b",
  Aspirador: "#1a4f4a",
  "Nao classificado": "#94a3b8",
};

export function fmtMetrica(v: number | null, formato: FormatoMetrica): string {
  if (v == null) return "—";
  if (formato === "brl") return formatarBRL(v);
  if (formato === "dec") return v.toFixed(2);
  return String(v);
}

// ---- Filtros da barra (enviados ao endpoint) ----
export type FiltrosMapa = {
  categoria: string | null;
  temperatura: "QUENTE" | "MORNO" | "FRIO" | null;
  situacao: "abertos" | "ganhos" | "perdidos" | null;
  segmento: "VAREJO" | "ATACADO" | null;
  // Janela por ultimo contato (dias). null = todos. Backend aceita 7/30/90/180.
  periodo: 7 | 30 | 90 | 180 | null;
};
export const FILTROS_MAPA_VAZIO: FiltrosMapa = {
  categoria: null,
  temperatura: null,
  situacao: null,
  segmento: null,
  periodo: null,
};

export function queryFiltros(f: FiltrosMapa, escopo = ""): string {
  const p = new URLSearchParams();
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.temperatura) p.set("temperatura", f.temperatura);
  if (f.situacao) p.set("situacao", f.situacao);
  if (f.segmento) p.set("segmento", f.segmento);
  if (f.periodo) p.set("periodo", String(f.periodo));
  for (const [k, v] of paramsEscopo(escopo)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function algumFiltroMapa(f: FiltrosMapa): boolean {
  return !!(f.categoria || f.temperatura || f.situacao || f.segmento || f.periodo);
}

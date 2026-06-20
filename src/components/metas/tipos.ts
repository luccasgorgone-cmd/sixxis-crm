// Tipos e helpers compartilhados pelas telas de metas (admin e colaborador).
import { formatarBRL, formatarDuracao } from "@/lib/format";

export type Metrica =
  | "VALOR_VENDIDO"
  | "QTD_GANHOS"
  | "CONVERSAO"
  | "CLIENTES_ATENDIDOS"
  | "TEMPO_RESPOSTA"
  | "TEMPO_RESOLUCAO";

export type Escopo = "COLABORADOR" | "EQUIPE";
export type Periodo = "DIARIA" | "SEMANAL" | "MENSAL" | "CUSTOM";
export type Finalidade = "VENDA" | "POS_VENDA" | "AMBAS";
export type Ritmo = "acima" | "no_ritmo" | "limite" | "abaixo" | "sem_dados";

export type Progresso = {
  alvo: number;
  atual: number;
  percentual: number;
  atingida: boolean;
  ritmo: Ritmo;
  projecao: number;
  diasRestantes: number;
  maiorMelhor: boolean;
  encerrada: boolean;
};

export type Meta = {
  id: string;
  nome: string | null;
  escopo: Escopo;
  agenteId: string | null;
  agente?: { id: string; nome: string } | null;
  finalidade: Finalidade;
  metrica: Metrica;
  alvo: number;
  periodo: Periodo;
  inicio: string;
  fim: string;
  ativo: boolean;
  progresso: Progresso;
  ranking?: { posicao: number; total: number } | null;
};

export const METRICAS: {
  chave: Metrica;
  rotulo: string;
  // Unidade exibida no formulario; tempos sao informados em minutos.
  unidade: string;
  maiorMelhor: boolean;
}[] = [
  { chave: "VALOR_VENDIDO", rotulo: "Valor vendido", unidade: "R$", maiorMelhor: true },
  { chave: "QTD_GANHOS", rotulo: "Negocios ganhos", unidade: "qtd", maiorMelhor: true },
  { chave: "CONVERSAO", rotulo: "Conversao", unidade: "%", maiorMelhor: true },
  { chave: "CLIENTES_ATENDIDOS", rotulo: "Clientes atendidos", unidade: "qtd", maiorMelhor: true },
  { chave: "TEMPO_RESPOSTA", rotulo: "Tempo de 1a resposta", unidade: "min", maiorMelhor: false },
  { chave: "TEMPO_RESOLUCAO", rotulo: "Tempo de resolucao", unidade: "min", maiorMelhor: false },
];

export const ROTULO_METRICA: Record<Metrica, string> = Object.fromEntries(
  METRICAS.map((m) => [m.chave, m.rotulo]),
) as Record<Metrica, string>;

export const ROTULO_PERIODO: Record<Periodo, string> = {
  DIARIA: "Diaria",
  SEMANAL: "Semanal",
  MENSAL: "Mensal",
  CUSTOM: "Personalizada",
};

export function ehTempo(m: Metrica): boolean {
  return m === "TEMPO_RESPOSTA" || m === "TEMPO_RESOLUCAO";
}

// Formata um valor "atual"/"alvo"/"projecao" conforme a metrica.
export function formatarValor(metrica: Metrica, valor: number): string {
  switch (metrica) {
    case "VALOR_VENDIDO":
      return formatarBRL(valor);
    case "CONVERSAO":
      return `${Math.round(valor)}%`;
    case "TEMPO_RESPOSTA":
    case "TEMPO_RESOLUCAO":
      return formatarDuracao(valor);
    default:
      return Math.round(valor).toLocaleString("pt-BR");
  }
}

// Valor armazenado (alvo) -> valor exibido no input do formulario.
// Tempos sao guardados em segundos mas editados em minutos.
export function alvoParaInput(metrica: Metrica, alvo: number): number {
  return ehTempo(metrica) ? Math.round(alvo / 60) : alvo;
}

// Valor do input do formulario -> valor armazenado (alvo).
export function inputParaAlvo(metrica: Metrica, valor: number): number {
  return ehTempo(metrica) ? valor * 60 : valor;
}

export const RITMO_INFO: Record<
  Ritmo,
  { rotulo: string; classe: string; ponto: string }
> = {
  acima: {
    rotulo: "Acima do ritmo",
    classe: "bg-green-100 text-green-700",
    ponto: "bg-green-500",
  },
  no_ritmo: {
    rotulo: "No ritmo",
    classe: "bg-green-100 text-green-700",
    ponto: "bg-green-500",
  },
  limite: {
    rotulo: "No limite",
    classe: "bg-amber-100 text-amber-700",
    ponto: "bg-amber-500",
  },
  abaixo: {
    rotulo: "Abaixo do ritmo",
    classe: "bg-red-100 text-red-700",
    ponto: "bg-red-500",
  },
  sem_dados: {
    rotulo: "Sem dados",
    classe: "bg-black/5 text-medio/60",
    ponto: "bg-medio/40",
  },
};

// Hex do ritmo para arco do donut / barra de progresso.
export function corRitmoHex(ritmo: Ritmo): string {
  switch (ritmo) {
    case "acima":
    case "no_ritmo":
      return "#16a34a";
    case "limite":
      return "#f59e0b";
    case "abaixo":
      return "#dc2626";
    case "sem_dados":
      return "#94a3b8";
  }
}

// Percentual inteiro para exibir (pode passar de 100).
export function pctExibido(p: Progresso): number {
  return Math.round(p.percentual * 100);
}

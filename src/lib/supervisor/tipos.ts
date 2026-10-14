// Tipos compartilhados do Supervisor Comercial IA (SPEC_SUPERVISOR_COMERCIAL_IA.md).
// Camada 1 (determinística): o PainelSupervisor é a forma ÚNICA consumida tanto
// pela UI quanto pelo contexto da IA (§4). Números nascem aqui, nunca no LLM.
import type { Finalidade, Temperatura } from "../../generated/prisma/enums";
import type { Metricas, Periodo } from "../metricas";
import type { AnalisePerdidos } from "../perdidos";

export type { Periodo } from "../metricas";

// Escopo opcional (igual ao de metricas.ts, redeclarado porque lá é privado).
export type EscopoSupervisor = { agenteId?: string; finalidade?: Finalidade };

// Semáforo de um indicador. "neutro" = não calculável (sem meta/sem dado) — a IA
// e a UI tratam neutro como "sem leitura", nunca como verde.
export type Semaforo = "verde" | "amarelo" | "vermelho" | "neutro";

export type UnidadeIndicador =
  | "pct" // 0..1 (formatar como %)
  | "seg"
  | "dias"
  | "reais"
  | "num"
  | "x"; // múltiplo (cobertura de funil)

// Um cartão do painel. `valor` null = indicador não calculável no período/escopo.
export type Indicador = {
  chave: string;
  titulo: string;
  valor: number | null;
  unidade: UnidadeIndicador;
  meta: number | null;
  semaforo: Semaforo;
  // true: maior é melhor (conversão, cobertura). false: menor é melhor (tempo).
  maiorMelhor: boolean;
  detalhe?: string;
};

// --- Resultados das métricas novas (§4). Cada um tem um CORE PURO (testável por
// fixture, sem banco) em indicadores.ts + um wrapper async que busca no banco. ---

export type PctPrazoResultado = {
  total: number; // conversas com 1ª resposta medível no período
  dentro: number; // com (1º OUT − 1º IN) <= limiar
  pct: number | null; // dentro/total, null se total=0
};

export type EtapaFunil = {
  etapaId: string;
  nome: string;
  ordem: number;
  emAberto: number; // negócios ABERTO parados nesta etapa (snapshot)
  valorEmAberto: number; // Σ COALESCE(valorAjustado, valor)
  cicloMedioDias: number | null; // média de (agora − entrouEtapaEm), null se vazio
};

export type SemProximoPassoResultado = {
  totalAbertos: number;
  semProximo: number; // ABERTO sem Lembrete PENDENTE futuro
  pct: number | null; // semProximo/totalAbertos
};

export type CoberturaResultado = {
  ponderadoReais: number; // Σ(valorEmAberto × peso[temperatura])
  metaRestanteReais: number | null; // meta do período − já vendido (floor > 0)
  cobertura: number | null; // ponderado / metaRestante (múltiplo), null se sem meta
};

export type OrigemResultado = {
  origem: string; // Lead.origem || anuncioTitulo || "(sem origem)"
  ganhos: number;
  perdas: number;
  valorGanho: number;
  conversao: number | null; // ganhos/(ganhos+perdas)
};

// Negócio parado (SLA) agregado por etapa, derivado de slaAlertas/entrouEtapaEm.
export type ParadoPorEtapa = {
  etapaId: string | null;
  nome: string;
  parados: number; // ABERTO com dias-na-etapa acima do limiar
  limiarDias: number | null;
};

// Linha do ranking por vendedor (reusa calcularMetricas por agenteId).
export type LinhaRanking = {
  agenteId: string;
  nome: string;
  ganhos: number;
  perdidos: number;
  valorVendido: number;
  conversao: number;
  tempoPrimeiraRespostaSeg: number;
  pctDentroDoPrazo: number | null;
  semProximoPasso: number;
};

// Objeto único do painel (§4). Forma só: UI e contexto da IA consomem o mesmo.
export type PainelSupervisor = {
  janela: { inicio: string; fim: string }; // ISO
  finalidade: Finalidade | null;
  geradoEm: string; // ISO
  metricas: Metricas;
  indicadores: Indicador[];
  funil: EtapaFunil[];
  semProximoPasso: SemProximoPassoResultado;
  cobertura: CoberturaResultado;
  pctDentroDoPrazo: PctPrazoResultado;
  perdas: AnalisePerdidos;
  parados: ParadoPorEtapa[];
  origens: OrigemResultado[];
  ranking: LinhaRanking[];
  limiares: SupervisorLimiares;
};

// --- Config / limiares (SupervisorConfig.limiaresJson). Defaults do doc (§4, D2). ---

export type PesosCobertura = Record<Temperatura, number>;

// Par de cortes do semáforo por indicador. Interpretação depende de maiorMelhor:
// maiorMelhor -> valor>=verde: verde; >=amarelo: amarelo; senão vermelho.
// menorMelhor -> valor<=verde: verde; <=amarelo: amarelo; senão vermelho.
export type CortesSemaforo = { verde: number; amarelo: number };

export type SupervisorLimiares = {
  // Prazo combinado de 1ª resposta (segundos). Doc: responder rápido é a maior
  // alavanca (achado histórico <5min converte 2-5x). Default = 1h.
  prazo1aRespostaSeg: number;
  pesosCobertura: PesosCobertura;
  // Meta de faturamento do período (reais) para cobertura de funil. null = sem
  // meta configurada -> cobertura fica neutra (não inventa denominador).
  metaPeriodoReais: number | null;
  // Dias parado na etapa que já conta como "parado" quando não há ConfigAlertaSla.
  paradoDiasPadrao: number;
  // Cortes de semáforo por chave de indicador.
  metas: Record<string, CortesSemaforo>;
};

// Chaves canônicas dos indicadores (estáveis — usadas em metas e testes).
export const IND = {
  PCT_PRAZO: "pct_dentro_prazo_1a_resposta",
  CONVERSAO: "conversao",
  COBERTURA: "cobertura_funil",
  SEM_PROXIMO: "sem_proximo_passo",
  TEMPO_1A_RESP: "tempo_1a_resposta_seg",
  TICKET: "ticket_medio",
} as const;

// Defaults do doc (D2: semeados, admin ajusta na tela depois).
export const LIMIARES_PADRAO: SupervisorLimiares = {
  prazo1aRespostaSeg: 60 * 60, // 1h
  pesosCobertura: { QUENTE: 0.8, MORNO: 0.5, FRIO: 0.2 },
  metaPeriodoReais: null,
  paradoDiasPadrao: 7,
  metas: {
    // % de 1ª resposta no prazo: >=80% verde, >=50% amarelo.
    [IND.PCT_PRAZO]: { verde: 0.8, amarelo: 0.5 },
    // Conversão (ganhos/finalizados): >=40% verde, >=25% amarelo.
    [IND.CONVERSAO]: { verde: 0.4, amarelo: 0.25 },
    // Cobertura de funil (doc: 3-4x): >=3 verde, >=2 amarelo.
    [IND.COBERTURA]: { verde: 3, amarelo: 2 },
    // % de abertos SEM próximo passo: menorMelhor. <=20% verde, <=40% amarelo.
    [IND.SEM_PROXIMO]: { verde: 0.2, amarelo: 0.4 },
    // Tempo médio de 1ª resposta (seg): menorMelhor. <=5min verde, <=30min amarelo.
    [IND.TEMPO_1A_RESP]: { verde: 5 * 60, amarelo: 30 * 60 },
  },
};

// Resolve o objeto de limiares a partir do JSON persistido (parcial/legado),
// aplicando os defaults campo a campo. Pura: usada pela API e nos testes.
export function resolverLimiares(
  bruto: unknown,
): SupervisorLimiares {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<
    string,
    unknown
  >;
  const pesosBrutos = (b.pesosCobertura ?? {}) as Partial<PesosCobertura>;
  const metasBrutas = (b.metas ?? {}) as Record<string, CortesSemaforo>;
  return {
    prazo1aRespostaSeg:
      typeof b.prazo1aRespostaSeg === "number" && b.prazo1aRespostaSeg > 0
        ? b.prazo1aRespostaSeg
        : LIMIARES_PADRAO.prazo1aRespostaSeg,
    pesosCobertura: {
      QUENTE:
        typeof pesosBrutos.QUENTE === "number"
          ? pesosBrutos.QUENTE
          : LIMIARES_PADRAO.pesosCobertura.QUENTE,
      MORNO:
        typeof pesosBrutos.MORNO === "number"
          ? pesosBrutos.MORNO
          : LIMIARES_PADRAO.pesosCobertura.MORNO,
      FRIO:
        typeof pesosBrutos.FRIO === "number"
          ? pesosBrutos.FRIO
          : LIMIARES_PADRAO.pesosCobertura.FRIO,
    },
    metaPeriodoReais:
      typeof b.metaPeriodoReais === "number" && b.metaPeriodoReais > 0
        ? b.metaPeriodoReais
        : null,
    paradoDiasPadrao:
      typeof b.paradoDiasPadrao === "number" && b.paradoDiasPadrao > 0
        ? b.paradoDiasPadrao
        : LIMIARES_PADRAO.paradoDiasPadrao,
    metas: { ...LIMIARES_PADRAO.metas, ...metasBrutas },
  };
}

// Avalia o semáforo de um valor contra os cortes, respeitando a direção.
// Pura (testada em contrato). valor null -> neutro.
export function avaliarSemaforo(
  valor: number | null,
  cortes: CortesSemaforo | undefined,
  maiorMelhor: boolean,
): Semaforo {
  if (valor === null || cortes === undefined) return "neutro";
  if (maiorMelhor) {
    if (valor >= cortes.verde) return "verde";
    if (valor >= cortes.amarelo) return "amarelo";
    return "vermelho";
  }
  if (valor <= cortes.verde) return "verde";
  if (valor <= cortes.amarelo) return "amarelo";
  return "vermelho";
}

// Reexport util para o painel montar a janela (mesma forma de metricas.Periodo).
export type Janela = Periodo;

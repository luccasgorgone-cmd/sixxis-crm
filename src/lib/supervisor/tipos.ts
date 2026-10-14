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

// --- Varredura periódica (SupervisorConfig.varreduraJson). Config própria da
// rotina de fundo que examina os atendimentos e abre propostas. Default SEGURO:
// desligada, até o gestor ligar na aba Configurações. ---

export type ItensVigiados = {
  semResposta: boolean; // última msg é do cliente e passou de semRespostaHoras
  semProximoPasso: boolean; // aberto sem lembrete futuro
  parado: boolean; // aberto parado além do limiar da etapa (SLA)
  primeiraResposta: boolean; // lead novo que estourou prazo de 1ª resposta
};

export type VarreduraConfig = {
  ativa: boolean;
  cadenciaMin: number; // minutos entre ciclos
  semRespostaHoras: number; // horas sem resposta que já conta como "largado"
  vigia: ItensVigiados;
};

// Faixas aceitas na EDIÇÃO (form/IA). Fora disso → rejeita com mensagem.
export const LIMITES_VARREDURA = {
  cadenciaMin: { min: 5, max: 1440 }, // 5 min a 24 h
  semRespostaHoras: { min: 1, max: 168 }, // 1 h a 7 dias
} as const;

export const VARREDURA_PADRAO: VarreduraConfig = {
  ativa: false, // nasce desligada (decisão de desenho: sem surpresa no deploy)
  cadenciaMin: 30,
  semRespostaHoras: 4,
  vigia: {
    semResposta: true,
    semProximoPasso: true,
    parado: true,
    primeiraResposta: true,
  },
};

// Resolve varredura a partir do JSON persistido (parcial/legado), aplicando
// defaults campo a campo e CLAMPando valores fora de faixa (tolerante na LEITURA
// — a escrita usa aplicarPatchConfig, que rejeita). Pura.
export function resolverVarredura(bruto: unknown): VarreduraConfig {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<
    string,
    unknown
  >;
  const v = (b.vigia && typeof b.vigia === "object" ? b.vigia : {}) as Record<
    string,
    unknown
  >;
  const clamp = (n: unknown, faixa: { min: number; max: number }, def: number) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.min(faixa.max, Math.max(faixa.min, n))
      : def;
  const bool = (x: unknown, def: boolean) =>
    typeof x === "boolean" ? x : def;
  return {
    ativa: bool(b.ativa, VARREDURA_PADRAO.ativa),
    cadenciaMin: clamp(
      b.cadenciaMin,
      LIMITES_VARREDURA.cadenciaMin,
      VARREDURA_PADRAO.cadenciaMin,
    ),
    semRespostaHoras: clamp(
      b.semRespostaHoras,
      LIMITES_VARREDURA.semRespostaHoras,
      VARREDURA_PADRAO.semRespostaHoras,
    ),
    vigia: {
      semResposta: bool(v.semResposta, VARREDURA_PADRAO.vigia.semResposta),
      semProximoPasso: bool(
        v.semProximoPasso,
        VARREDURA_PADRAO.vigia.semProximoPasso,
      ),
      parado: bool(v.parado, VARREDURA_PADRAO.vigia.parado),
      primeiraResposta: bool(
        v.primeiraResposta,
        VARREDURA_PADRAO.vigia.primeiraResposta,
      ),
    },
  };
}

// --- Aprendizado (SupervisorConfig.aprendizadoJson). Snapshot determinístico do
// loop de feedback: a IA acumula o que o gestor aceitou/descartou e o que deu
// certo, destila em insights e realimenta as decisões. Zero token, sem re-treino.
// Ver SPEC_SUPERVISOR_APRENDIZADO.md e aprendizado.ts (computação). ---

// Os 4 sinais da varredura + "outro" (ações de chat/form sem sinal de varredura).
export type SinalVarredura =
  | "semResposta"
  | "semProximoPasso"
  | "parado"
  | "primeiraResposta"
  | "outro";

// Rótulo humano de um sinal (para insights/UI). Puro e client-safe (fica aqui,
// não em aprendizado.ts, que importa prisma/painel — server-only).
export function nomeSinal(s: SinalVarredura): string {
  switch (s) {
    case "semResposta": return "cliente sem resposta";
    case "semProximoPasso": return "sem próximo passo";
    case "parado": return "negócio parado";
    case "primeiraResposta": return "1ª resposta estourada";
    default: return "outras ações";
  }
}

// Força de um insight pelo tamanho da amostra (honestidade: amostra pequena é
// marcada, não escondida).
export type ForcaInsight = "forte" | "media" | "fraca";

export type Insight = {
  texto: string;
  forca: ForcaInsight;
};

// Aceitação de um tipo (sinal ou ferramenta): EXECUTADO ÷ (EXECUTADO+DESCARTADO).
export type AceitacaoItem = {
  chave: string; // sinal ou nome da ferramenta
  executadas: number;
  descartadas: number;
  taxa: number | null; // null quando não há amostra (exec+desc = 0)
};

// Sucesso de um sinal: das ações EXECUTADAS num negócio, quantas viraram GANHO.
export type SucessoSinal = {
  sinal: SinalVarredura;
  executadas: number; // com negócio já fechado (GANHO ou PERDIDO)
  ganhos: number;
  taxa: number | null; // ganhos ÷ fechadas, null quando sem amostra
};

export type ResumoHistorico = {
  geradoEm: string; // ISO
  aceitacaoGeral: number | null;
  amostra: number;
};

export type AprendizadoSnapshot = {
  geradoEm: string | null; // ISO; null = nunca estudou
  cadenciaHoras: number; // de quanto em quanto tempo recomputa (default 12)
  amostras: { acoes: number; fechados: number };
  aceitacaoPorSinal: AceitacaoItem[];
  aceitacaoPorFerramenta: AceitacaoItem[];
  sucessoPorSinal: SucessoSinal[];
  insights: Insight[];
  historico: ResumoHistorico[]; // últimos N resumos (mais recente primeiro)
};

// Faixas de amostra para a força do insight (e corte mínimo para emitir).
export const AMOSTRA = { forte: 20, media: 8, min: 3 } as const;
// Faixa aceita para a cadência de estudo (horas).
export const LIMITES_APRENDIZADO = { cadenciaHoras: { min: 1, max: 168 } } as const;
export const CADENCIA_ESTUDO_PADRAO = 12;
export const HISTORICO_MAX = 10;

export const APRENDIZADO_PADRAO: AprendizadoSnapshot = {
  geradoEm: null,
  cadenciaHoras: CADENCIA_ESTUDO_PADRAO,
  amostras: { acoes: 0, fechados: 0 },
  aceitacaoPorSinal: [],
  aceitacaoPorFerramenta: [],
  sucessoPorSinal: [],
  insights: [],
  historico: [],
};

// Resolve o snapshot a partir do JSON persistido (parcial/legado), aplicando
// defaults campo a campo e CLAMPando a cadência. Tolerante na LEITURA. Pura.
export function resolverAprendizado(bruto: unknown): AprendizadoSnapshot {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<
    string,
    unknown
  >;
  const arr = <T>(x: unknown, map: (o: Record<string, unknown>) => T | null): T[] => {
    if (!Array.isArray(x)) return [];
    const out: T[] = [];
    for (const it of x) {
      if (it && typeof it === "object") {
        const v = map(it as Record<string, unknown>);
        if (v !== null) out.push(v);
      }
    }
    return out;
  };
  const num = (x: unknown, def = 0): number =>
    typeof x === "number" && Number.isFinite(x) ? x : def;
  const taxaOuNull = (x: unknown): number | null =>
    typeof x === "number" && Number.isFinite(x) ? x : null;

  const am = (b.amostras && typeof b.amostras === "object" ? b.amostras : {}) as Record<string, unknown>;
  const cad = num(b.cadenciaHoras, CADENCIA_ESTUDO_PADRAO);
  return {
    geradoEm: typeof b.geradoEm === "string" ? b.geradoEm : null,
    cadenciaHoras: Math.min(
      LIMITES_APRENDIZADO.cadenciaHoras.max,
      Math.max(LIMITES_APRENDIZADO.cadenciaHoras.min, cad),
    ),
    amostras: { acoes: num(am.acoes), fechados: num(am.fechados) },
    aceitacaoPorSinal: arr<AceitacaoItem>(b.aceitacaoPorSinal, (o) =>
      typeof o.chave === "string"
        ? { chave: o.chave, executadas: num(o.executadas), descartadas: num(o.descartadas), taxa: taxaOuNull(o.taxa) }
        : null,
    ),
    aceitacaoPorFerramenta: arr<AceitacaoItem>(b.aceitacaoPorFerramenta, (o) =>
      typeof o.chave === "string"
        ? { chave: o.chave, executadas: num(o.executadas), descartadas: num(o.descartadas), taxa: taxaOuNull(o.taxa) }
        : null,
    ),
    sucessoPorSinal: arr<SucessoSinal>(b.sucessoPorSinal, (o) =>
      typeof o.sinal === "string"
        ? { sinal: o.sinal as SinalVarredura, executadas: num(o.executadas), ganhos: num(o.ganhos), taxa: taxaOuNull(o.taxa) }
        : null,
    ),
    insights: arr<Insight>(b.insights, (o) =>
      typeof o.texto === "string"
        ? { texto: o.texto, forca: (o.forca === "forte" || o.forca === "media" || o.forca === "fraca" ? o.forca : "fraca") }
        : null,
    ),
    historico: arr<ResumoHistorico>(b.historico, (o) =>
      typeof o.geradoEm === "string"
        ? { geradoEm: o.geradoEm, aceitacaoGeral: taxaOuNull(o.aceitacaoGeral), amostra: num(o.amostra) }
        : null,
    ).slice(0, HISTORICO_MAX),
  };
}

// --- Edição de config (form + IA): PONTO ÚNICO de validação. Recebe o estado
// atual já resolvido + um patch parcial; devolve o novo estado ou um erro legível
// (nunca aplica valor inválido). Pura (testada em contrato c6). ---

export type ConfigEditavel = {
  limiares: SupervisorLimiares;
  varredura: VarreduraConfig;
};

export type PatchConfig = {
  limiares?: Record<string, unknown>;
  varredura?: Record<string, unknown>;
};

export type ResultadoPatch =
  | { ok: true; valor: ConfigEditavel }
  | { ok: false; erro: string };

function ehNumero(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function aplicarPatchConfig(
  base: ConfigEditavel,
  patch: PatchConfig,
): ResultadoPatch {
  // Começa de cópias profundas o suficiente para não mutar o base.
  const lim: SupervisorLimiares = {
    ...base.limiares,
    pesosCobertura: { ...base.limiares.pesosCobertura },
    metas: { ...base.limiares.metas },
  };
  const varr: VarreduraConfig = {
    ...base.varredura,
    vigia: { ...base.varredura.vigia },
  };

  const pl = patch.limiares ?? {};
  if ("prazo1aRespostaSeg" in pl) {
    const n = pl.prazo1aRespostaSeg;
    if (!ehNumero(n) || n <= 0 || n > 24 * 3600) {
      return { ok: false, erro: "prazo de 1ª resposta deve ser entre 1s e 24h (em segundos)" };
    }
    lim.prazo1aRespostaSeg = Math.round(n);
  }
  if ("metaPeriodoReais" in pl) {
    const n = pl.metaPeriodoReais;
    if (n === null || n === 0) {
      lim.metaPeriodoReais = null; // 0/null = sem meta (cobertura neutra)
    } else if (!ehNumero(n) || n < 0) {
      return { ok: false, erro: "meta do período deve ser um valor em reais >= 0 (ou vazio para 'sem meta')" };
    } else {
      lim.metaPeriodoReais = n;
    }
  }
  if ("paradoDiasPadrao" in pl) {
    const n = pl.paradoDiasPadrao;
    if (!ehNumero(n) || n < 1 || n > 365 || !Number.isInteger(n)) {
      return { ok: false, erro: "dias para 'parado' deve ser um inteiro entre 1 e 365" };
    }
    lim.paradoDiasPadrao = n;
  }
  if ("pesosCobertura" in pl) {
    const pesos = pl.pesosCobertura;
    if (!pesos || typeof pesos !== "object") {
      return { ok: false, erro: "pesosCobertura deve ser um objeto {QUENTE,MORNO,FRIO}" };
    }
    for (const chave of ["QUENTE", "MORNO", "FRIO"] as const) {
      const v = (pesos as Record<string, unknown>)[chave];
      if (v === undefined) continue;
      if (!ehNumero(v) || v < 0 || v > 1) {
        return { ok: false, erro: `peso ${chave} deve ser um número entre 0 e 1` };
      }
      lim.pesosCobertura[chave] = v;
    }
  }
  if ("metas" in pl) {
    const metas = pl.metas;
    if (!metas || typeof metas !== "object") {
      return { ok: false, erro: "metas deve ser um objeto por indicador" };
    }
    for (const [chave, corte] of Object.entries(metas as Record<string, unknown>)) {
      if (!corte || typeof corte !== "object") {
        return { ok: false, erro: `meta de "${chave}" deve ter {verde, amarelo}` };
      }
      const c = corte as Record<string, unknown>;
      if (!ehNumero(c.verde) || !ehNumero(c.amarelo)) {
        return { ok: false, erro: `meta de "${chave}": verde e amarelo devem ser números` };
      }
      lim.metas[chave] = { verde: c.verde, amarelo: c.amarelo };
    }
  }

  const pv = patch.varredura ?? {};
  if ("ativa" in pv) {
    if (typeof pv.ativa !== "boolean") {
      return { ok: false, erro: "varredura.ativa deve ser true/false" };
    }
    varr.ativa = pv.ativa;
  }
  if ("cadenciaMin" in pv) {
    const n = pv.cadenciaMin;
    const f = LIMITES_VARREDURA.cadenciaMin;
    if (!ehNumero(n) || !Number.isInteger(n) || n < f.min || n > f.max) {
      return { ok: false, erro: `cadência deve ser um inteiro entre ${f.min} e ${f.max} minutos` };
    }
    varr.cadenciaMin = n;
  }
  if ("semRespostaHoras" in pv) {
    const n = pv.semRespostaHoras;
    const f = LIMITES_VARREDURA.semRespostaHoras;
    if (!ehNumero(n) || n < f.min || n > f.max) {
      return { ok: false, erro: `horas sem resposta deve ser entre ${f.min} e ${f.max}` };
    }
    varr.semRespostaHoras = n;
  }
  if ("vigia" in pv) {
    const vig = pv.vigia;
    if (!vig || typeof vig !== "object") {
      return { ok: false, erro: "varredura.vigia deve ser um objeto de flags" };
    }
    for (const chave of ["semResposta", "semProximoPasso", "parado", "primeiraResposta"] as const) {
      const v = (vig as Record<string, unknown>)[chave];
      if (v === undefined) continue;
      if (typeof v !== "boolean") {
        return { ok: false, erro: `vigia.${chave} deve ser true/false` };
      }
      varr.vigia[chave] = v;
    }
  }

  return { ok: true, valor: { limiares: lim, varredura: varr } };
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

// Calculo de progresso de metas, reusando as agregacoes de metricas.ts.
// Para VALOR_VENDIDO/QTD_GANHOS/CONVERSAO/CLIENTES_ATENDIDOS "maior e melhor".
// Para TEMPO_RESPOSTA/TEMPO_RESOLUCAO "menor e melhor" (alvo = teto).
import { prisma } from "./prisma";
import { calcularMetricas, type Metricas, type Periodo } from "./metricas";
import { campoDono } from "./dono";
import {
  MetricaMeta,
  EscopoMeta,
  Papel,
  Finalidade,
} from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";

// Dados minimos de uma meta para apurar progresso (espelha o model Meta).
export type MetaBase = {
  id: string;
  nome: string | null;
  escopo: EscopoMeta;
  agenteId: string | null;
  finalidade: "VENDA" | "POS_VENDA" | "AMBAS";
  metrica: MetricaMeta;
  alvo: number;
  periodo: "DIARIA" | "SEMANAL" | "MENSAL" | "CUSTOM";
  inicio: Date;
  fim: Date;
  ativo: boolean;
};

export type Ritmo = "acima" | "no_ritmo" | "limite" | "abaixo" | "sem_dados";

export type ProgressoMeta = {
  alvo: number;
  atual: number;
  percentual: number; // 0..1+ (clamp na UI); real para exibir o %
  atingida: boolean;
  ritmo: Ritmo;
  projecao: number; // estimativa de fim de periodo
  diasRestantes: number;
  maiorMelhor: boolean;
  encerrada: boolean; // periodo ja terminou
};

const DIA_MS = 24 * 60 * 60 * 1000;

// Metricas de tempo sao "menor e melhor"; as demais "maior e melhor".
export function metricaMaiorMelhor(m: MetricaMeta): boolean {
  return (
    m !== MetricaMeta.TEMPO_RESPOSTA && m !== MetricaMeta.TEMPO_RESOLUCAO
  );
}

// Extrai o valor "atual" de uma metrica a partir do bloco de metricas.
// CONVERSAO em pontos percentuais (0..100) para casar com alvo em %.
export function valorMetrica(m: Metricas, metrica: MetricaMeta): number {
  switch (metrica) {
    case MetricaMeta.VALOR_VENDIDO:
      return m.valorVendido;
    case MetricaMeta.QTD_GANHOS:
      return m.ganhos;
    case MetricaMeta.CONVERSAO:
      return m.conversao * 100;
    case MetricaMeta.CLIENTES_ATENDIDOS:
      return m.clientesAtendidos;
    case MetricaMeta.TEMPO_RESPOSTA:
      return m.tempoPrimeiraRespostaSeg;
    case MetricaMeta.TEMPO_RESOLUCAO:
      return m.tempoResolucaoSeg;
  }
}

// Escopo (agente/finalidade) que metricas.ts entende, a partir da meta.
function escopoDaMeta(meta: MetaBase): {
  agenteId?: string;
  finalidade?: Finalidade;
} {
  const finalidade =
    meta.finalidade === "AMBAS"
      ? undefined
      : (meta.finalidade as Finalidade);
  if (meta.escopo === EscopoMeta.COLABORADOR && meta.agenteId) {
    return { agenteId: meta.agenteId, finalidade };
  }
  return { finalidade };
}

// Apura o progresso de uma meta no intervalo [inicio, fim], com ritmo (realizado
// vs esperado proporcional ao tempo decorrido) e projecao de fim de periodo.
export async function calcularProgresso(
  meta: MetaBase,
  agora: Date = new Date(),
): Promise<ProgressoMeta> {
  const escopo = escopoDaMeta(meta);
  const periodo: Periodo = { inicio: meta.inicio, fim: meta.fim };
  const metricas = await calcularMetricas(periodo, escopo);
  const atual = valorMetrica(metricas, meta.metrica);
  return montarProgresso(meta, atual, agora);
}

// Parte pura do calculo (testavel/reusavel), dado o valor ja apurado.
export function montarProgresso(
  meta: MetaBase,
  atual: number,
  agora: Date,
): ProgressoMeta {
  const totalMs = meta.fim.getTime() - meta.inicio.getTime();
  const decorridoMs = Math.min(
    Math.max(agora.getTime() - meta.inicio.getTime(), 0),
    Math.max(totalMs, 0),
  );
  const fracao = totalMs > 0 ? decorridoMs / totalMs : 1;
  const encerrada = agora.getTime() >= meta.fim.getTime();
  const diasRestantes = Math.max(
    0,
    Math.ceil((meta.fim.getTime() - agora.getTime()) / DIA_MS),
  );
  const maiorMelhor = metricaMaiorMelhor(meta.metrica);

  let percentual: number;
  let atingida: boolean;
  let ritmo: Ritmo;
  let projecao: number;

  if (maiorMelhor) {
    percentual = meta.alvo > 0 ? atual / meta.alvo : 0;
    atingida = meta.alvo > 0 && atual >= meta.alvo;
    projecao = fracao > 0 ? atual / fracao : atual;
    const esperado = meta.alvo * fracao;
    if (atingida) ritmo = "acima";
    else if (esperado <= 0) ritmo = "no_ritmo";
    else if (atual >= esperado * 1.05) ritmo = "acima";
    else if (atual >= esperado * 0.95) ritmo = "no_ritmo";
    else if (atual >= esperado * 0.8) ritmo = "limite";
    else ritmo = "abaixo";
  } else {
    // Menor e melhor (tempos). atual <= 0 = sem dados no periodo.
    if (atual <= 0) {
      percentual = 0;
      atingida = false;
      ritmo = "sem_dados";
      projecao = 0;
    } else {
      percentual = meta.alvo > 0 ? Math.min(meta.alvo / atual, 1) : 0;
      atingida = atual <= meta.alvo;
      projecao = atual; // a media tende a se manter
      if (atingida) ritmo = atual <= meta.alvo * 0.9 ? "acima" : "no_ritmo";
      else if (atual <= meta.alvo * 1.25) ritmo = "limite";
      else ritmo = "abaixo";
    }
  }

  return {
    alvo: meta.alvo,
    atual,
    percentual,
    atingida,
    ritmo,
    projecao,
    diasRestantes,
    maiorMelhor,
    encerrada,
  };
}

export type RankingMetrica = { posicao: number; total: number };

// Posicao do agente no ranking da metrica entre os colaboradores ativos, no
// periodo e finalidade da meta. Para "menor e melhor", menor valor (>0) e melhor.
export async function rankingMetrica(
  periodo: Periodo,
  finalidade: Finalidade | undefined,
  metrica: MetricaMeta,
  agenteId: string,
): Promise<RankingMetrica> {
  const agentes = await prisma.agente.findMany({
    where: { ativo: true, papel: { not: Papel.ADMIN } },
    select: { id: true },
  });
  const valores = await Promise.all(
    agentes.map(async (a) => {
      const m = await calcularMetricas(periodo, { agenteId: a.id, finalidade });
      return { id: a.id, valor: valorMetrica(m, metrica) };
    }),
  );
  const maiorMelhor = metricaMaiorMelhor(metrica);
  const ordenado = valores.sort((x, y) => {
    if (maiorMelhor) return y.valor - x.valor;
    // Menor e melhor: ascendente, mas zero (sem dados) vai pro fim.
    const vx = x.valor > 0 ? x.valor : Infinity;
    const vy = y.valor > 0 ? y.valor : Infinity;
    return vx - vy;
  });
  const idx = ordenado.findIndex((r) => r.id === agenteId);
  return { posicao: idx >= 0 ? idx + 1 : 0, total: agentes.length };
}

// ---- Autonomia/propriedade (fatia 2.18) ----

type MetaProp = {
  escopo: EscopoMeta;
  agenteId: string | null;
  criadoPorId: string | null;
};

// Colaborador so edita as PROPRIAS metas: escopo COLABORADOR, para ele mesmo e
// criadas por ele mesmo. Admin edita todas.
export function podeEditarMeta(
  agente: { id: string; papel: Papel },
  meta: MetaProp,
): boolean {
  if (agente.papel === Papel.ADMIN) return true;
  return (
    meta.escopo === EscopoMeta.COLABORADOR &&
    meta.agenteId === agente.id &&
    meta.criadoPorId === agente.id
  );
}

// A meta se aplica ao agente (pode visualizar)? Admin ve tudo. Colaborador ve
// as proprias (COLABORADOR para ele) e as de EQUIPE que incluem sua finalidade.
export function metaSeAplica(
  agente: { id: string; papel: Papel },
  meta: { escopo: EscopoMeta; agenteId: string | null; finalidade: string },
  acesso: { acessoVenda: boolean; acessoPosVenda: boolean },
): boolean {
  if (agente.papel === Papel.ADMIN) return true;
  if (meta.escopo === EscopoMeta.COLABORADOR) {
    return meta.agenteId === agente.id;
  }
  // EQUIPE: aplica se a finalidade bate com algum acesso do agente.
  if (meta.finalidade === "AMBAS") return true;
  if (meta.finalidade === "VENDA") return acesso.acessoVenda;
  return acesso.acessoPosVenda;
}

// Filtro de negocios que "contam" para uma meta (finalidade + dono), sem status
// nem periodo — usado nos drill-downs (ganhos/pendentes/perdidos/abertos).
export function whereNegociosMeta(meta: {
  escopo: EscopoMeta;
  agenteId: string | null;
  finalidade: "VENDA" | "POS_VENDA" | "AMBAS";
}): Prisma.NegocioWhereInput {
  const fins: Finalidade[] =
    meta.finalidade === "AMBAS"
      ? [Finalidade.VENDA, Finalidade.POS_VENDA]
      : [meta.finalidade as Finalidade];

  if (meta.escopo === EscopoMeta.COLABORADOR && meta.agenteId) {
    return {
      OR: fins.map((f) => ({
        finalidade: f,
        lead: { [campoDono(f)]: meta.agenteId } as Prisma.LeadWhereInput,
      })),
    };
  }
  return { finalidade: { in: fins } };
}

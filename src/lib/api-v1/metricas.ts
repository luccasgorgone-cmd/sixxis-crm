// KPIs da API de Leitura v1. SO leitura (SELECT/aggregate/groupBy e $queryRaw de
// leitura). Nenhuma escrita. Fuso dos recortes temporais: America/Sao_Paulo.
//
// REGRA DE FATURAMENTO (critica, ver AGENTS.md "Ponto de atencao nº1"):
// faturamento conta por "houve GANHO no periodo", NAO pelo status atual do
// negocio. Fonte = HistoricoNegocio{tipo:GANHO}.valorGanho + criadoEm (o evento
// de ganho), que sobrevive a reabertura do negocio. Nunca somar Negocio.valor
// filtrando por status=GANHO (reabrir zera a metrica em silencio).

import { prisma } from "@/lib/prisma";
import { requisicaoInvalida } from "./erros";
import { paraDecimalString } from "./serializar";

const TZ = "America/Sao_Paulo";
const AGRUPAR_VALIDO = { dia: "day", semana: "week", mes: "month" } as const;
type Agrupar = keyof typeof AGRUPAR_VALIDO;

export interface ParamsMetrica {
  de?: string | null;
  ate?: string | null;
  agrupar?: string | null;
}

interface Janela {
  de: Date;
  ate: Date;
  agrupar: Agrupar;
  unidade: (typeof AGRUPAR_VALIDO)[Agrupar];
}

function parseJanela(p: ParamsMetrica, diasPadrao = 30): Janela {
  const ate = p.ate ? new Date(p.ate) : new Date();
  if (Number.isNaN(ate.getTime())) throw requisicaoInvalida("Parametro 'ate' nao e uma data valida.");
  let de: Date;
  if (p.de) {
    de = new Date(p.de);
    if (Number.isNaN(de.getTime())) throw requisicaoInvalida("Parametro 'de' nao e uma data valida.");
  } else {
    de = new Date(ate.getTime() - diasPadrao * 24 * 60 * 60 * 1000);
  }
  if (de > ate) throw requisicaoInvalida("'de' nao pode ser depois de 'ate'.");
  const agrupar = (p.agrupar ?? "dia") as Agrupar;
  if (!(agrupar in AGRUPAR_VALIDO)) throw requisicaoInvalida("'agrupar' deve ser dia, semana ou mes.");
  return { de, ate, agrupar, unidade: AGRUPAR_VALIDO[agrupar] };
}

function num(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return Number(v ?? 0);
}

// --- Leads por origem -------------------------------------------------------
async function leadsPorOrigem(p: ParamsMetrica) {
  const { de, ate } = parseJanela(p);
  const grupos = await prisma.lead.groupBy({
    by: ["origem"],
    where: { criadoEm: { gte: de, lte: ate }, arquivado: false },
    _count: { _all: true },
  });
  const total = grupos.reduce((s, g) => s + num(g._count._all), 0);
  return {
    de: de.toISOString(),
    ate: ate.toISOString(),
    total,
    porOrigem: grupos
      .map((g) => ({ origem: g.origem ?? "(sem origem)", total: num(g._count._all) }))
      .sort((a, b) => b.total - a.total),
  };
}

// --- Funil (negocios abertos por etapa) -------------------------------------
async function funil() {
  const grupos = await prisma.negocio.groupBy({
    by: ["etapaId"],
    where: { status: "ABERTO", arquivado: false },
    _count: { _all: true },
  });
  const etapas = await prisma.etapa.findMany({ select: { id: true, nome: true, ordem: true } });
  const mapa = new Map(etapas.map((e) => [e.id, e]));
  const linhas = grupos
    .map((g) => {
      const e = g.etapaId ? mapa.get(g.etapaId) : undefined;
      return {
        etapaId: g.etapaId,
        etapa: e?.nome ?? "(sem etapa)",
        ordem: e?.ordem ?? 9999,
        total: num(g._count._all),
      };
    })
    .sort((a, b) => a.ordem - b.ordem);
  return { totalAbertos: linhas.reduce((s, l) => s + l.total, 0), etapas: linhas };
}

// --- Faturamento (ganho no periodo) + serie temporal ------------------------
async function faturamento(p: ParamsMetrica) {
  const { de, ate, agrupar, unidade } = parseJanela(p);
  const serie = await prisma.$queryRaw<Array<{ bucket: Date; total: unknown; qtd: unknown }>>`
    SELECT date_trunc(${unidade}, ("criadoEm" AT TIME ZONE ${TZ})) AS bucket,
           COALESCE(SUM("valorGanho"), 0) AS total,
           COUNT(*) AS qtd
    FROM "HistoricoNegocio"
    WHERE "tipo" = 'GANHO' AND "criadoEm" >= ${de} AND "criadoEm" <= ${ate}
    GROUP BY bucket
    ORDER BY bucket ASC`;
  const totalGeral = await prisma.historicoNegocio.aggregate({
    where: { tipo: "GANHO", criadoEm: { gte: de, lte: ate } },
    _sum: { valorGanho: true },
    _count: { _all: true },
  });
  return {
    de: de.toISOString(),
    ate: ate.toISOString(),
    agrupar,
    totalFaturado: paraDecimalString(totalGeral._sum.valorGanho) ?? "0.00",
    ganhos: num(totalGeral._count._all),
    serie: serie.map((r) => ({
      periodo: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket),
      total: paraDecimalString(r.total) ?? "0.00",
      ganhos: num(r.qtd),
    })),
  };
}

// --- Desempenho por vendedor (ganhos no periodo) ----------------------------
async function vendedores(p: ParamsMetrica) {
  const { de, ate } = parseJanela(p);
  const grupos = await prisma.historicoNegocio.groupBy({
    by: ["agenteId"],
    where: { tipo: "GANHO", criadoEm: { gte: de, lte: ate } },
    _sum: { valorGanho: true },
    _count: { _all: true },
  });
  const agentes = await prisma.agente.findMany({ select: { id: true, nome: true } });
  const mapa = new Map(agentes.map((a) => [a.id, a.nome]));
  return {
    de: de.toISOString(),
    ate: ate.toISOString(),
    vendedores: grupos
      .map((g) => ({
        agenteId: g.agenteId,
        agente: g.agenteId ? mapa.get(g.agenteId) ?? "(desconhecido)" : "(sem agente)",
        faturado: paraDecimalString(g._sum.valorGanho) ?? "0.00",
        ganhos: num(g._count._all),
      }))
      .sort((a, b) => Number(b.faturado) - Number(a.faturado)),
  };
}

// --- Volume de mensagens (entrada/saida por instancia) ----------------------
async function mensagens(p: ParamsMetrica) {
  const { de, ate } = parseJanela(p, 7);
  const porDirecao = await prisma.mensagem.groupBy({
    by: ["direcao"],
    where: { hora: { gte: de, lte: ate } },
    _count: { _all: true },
  });
  const porInstancia = await prisma.mensagem.groupBy({
    by: ["direcao", "instancia"],
    where: { hora: { gte: de, lte: ate } },
    _count: { _all: true },
  });
  return {
    de: de.toISOString(),
    ate: ate.toISOString(),
    porDirecao: porDirecao.map((g) => ({ direcao: g.direcao, total: num(g._count._all) })),
    porInstancia: porInstancia
      .map((g) => ({ direcao: g.direcao, instancia: g.instancia ?? "(sem instancia)", total: num(g._count._all) }))
      .sort((a, b) => b.total - a.total),
  };
}

// --- Tarefas (abertas / vencidas) -------------------------------------------
async function tarefas() {
  const agora = new Date();
  const [abertas, vencidas, concluidas] = await Promise.all([
    prisma.tarefa.count({ where: { status: "PENDENTE" } }),
    prisma.tarefa.count({ where: { status: "PENDENTE", dataHora: { lt: agora } } }),
    prisma.tarefa.count({ where: { status: "CONCLUIDA" } }),
  ]);
  return { abertas: num(abertas), vencidas: num(vencidas), concluidas: num(concluidas), geradoEm: agora.toISOString() };
}

// --- Dispatcher -------------------------------------------------------------
export const METRICAS: Record<string, (p: ParamsMetrica) => Promise<unknown>> = {
  "leads-por-origem": leadsPorOrigem,
  funil: () => funil(),
  faturamento,
  vendedores,
  mensagens,
  tarefas: () => tarefas(),
};

export function listarMetricas(): string[] {
  return Object.keys(METRICAS);
}

export async function executarMetrica(nome: string, p: ParamsMetrica): Promise<unknown> {
  const fn = METRICAS[nome];
  if (!fn) throw requisicaoInvalida(`Metrica desconhecida: '${nome}'. Disponiveis: ${listarMetricas().join(", ")}.`);
  return fn(p);
}

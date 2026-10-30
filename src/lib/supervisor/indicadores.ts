// Camada 1 — indicadores NOVOS do Supervisor (§4) que o Oracle ainda não expõe.
// Cada métrica = CORE PURO (determinístico, testável por fixture sem banco) +
// wrapper async que busca as linhas e chama o core. Números nascem aqui.
import { prisma } from "../prisma";
import { Prisma } from "../../generated/prisma/client";
import { StatusNeg, Temperatura } from "../../generated/prisma/enums";
import type { Finalidade } from "../../generated/prisma/enums";
import { coletarSegundos1aResposta } from "../presenca/primeiraRespostaDb";
import type {
  CoberturaResultado,
  EscopoSupervisor,
  EtapaFunil,
  FaixaResposta,
  Janela,
  OrigemResultado,
  ParadoPorEtapa,
  PctPrazoResultado,
  PesosCobertura,
  SemProximoPassoResultado,
} from "./tipos";

const MS_DIA = 24 * 60 * 60 * 1000;

// valorAjustado MANDA quando != null (regra de ouro do faturamento); senão valor.
export function valorEfetivo(
  valor: Prisma.Decimal | number | null,
  valorAjustado: Prisma.Decimal | number | null,
): number {
  if (valorAjustado !== null && valorAjustado !== undefined) {
    return Number(valorAjustado);
  }
  if (valor !== null && valor !== undefined) return Number(valor);
  return 0;
}

// WHERE de escopo (Negocio) sem status/janela — compõe por AND.
function escopoNegocioWhere(e: EscopoSupervisor): Prisma.NegocioWhereInput {
  const w: Prisma.NegocioWhereInput = {};
  if (e.agenteId) w.agenteId = e.agenteId;
  if (e.finalidade) w.finalidade = e.finalidade;
  return w;
}

// ───────────────────────── 1) % 1ª resposta no prazo ─────────────────────────

// CORE: dado o tempo (s) de 1ª resposta de cada conversa e o limiar, % dentro.
export function corePctPrazo(
  temposSeg: number[],
  limiarSeg: number,
): PctPrazoResultado {
  const total = temposSeg.length;
  const dentro = temposSeg.filter((t) => t <= limiarSeg).length;
  return { total, dentro, pct: total > 0 ? dentro / total : null };
}

// Faixas do histograma de 1ª resposta (corte superior inclusivo, em segundos).
const FAIXAS_1A_RESPOSTA: { rotulo: string; max: number }[] = [
  { rotulo: "< 5 min", max: 300 },
  { rotulo: "5–15 min", max: 900 },
  { rotulo: "15–60 min", max: 3600 },
  { rotulo: "1–4 h", max: 14400 },
  { rotulo: "4–24 h", max: 86400 },
  { rotulo: "> 24 h", max: Infinity },
];

// CORE: distribui os tempos (s) pelas faixas. Determinístico, testável por fixture.
export function distribuir1aResposta(temposSeg: number[]): FaixaResposta[] {
  const qtds = FAIXAS_1A_RESPOSTA.map(() => 0);
  for (const t of temposSeg) {
    const i = FAIXAS_1A_RESPOSTA.findIndex((f) => t <= f.max);
    if (i >= 0) qtds[i]++;
  }
  return FAIXAS_1A_RESPOSTA.map((f, i) => ({ rotulo: f.rotulo, qtd: qtds[i] }));
}

export async function pctDentroDoPrazo1aResposta(
  j: Janela,
  limiarSeg: number,
  e: EscopoSupervisor = {},
): Promise<PctPrazoResultado> {
  // Mesma FONTE ÚNICA da media (metricas.ts): segundos de 1a resposta por conversa
  // medidos pelo tempo ONLINE do dono (fallback wall-clock). O "prazo" agora e
  // tempo-disponivel, nao relogio de parede — coerente com a media exibida e com
  // o design (presenca substitui o horario comercial fixo).
  const tempos = await coletarSegundos1aResposta(j.inicio, j.fim, e);
  return { ...corePctPrazo(tempos, limiarSeg), distribuicao: distribuir1aResposta(tempos) };
}

// ───────────────────────── 2) Funil por etapa ─────────────────────────

type LinhaNegocioEtapa = {
  etapaId: string | null;
  entrouEtapaEm: Date;
  valor: Prisma.Decimal | number | null;
  valorAjustado: Prisma.Decimal | number | null;
};
type MetaEtapa = { id: string; nome: string; ordem: number };

// CORE: distribui os negócios ABERTO pelas etapas (snapshot) + ciclo médio.
// Inclui etapas com 0 negócios (vêm da lista de etapas), ordenadas por `ordem`.
export function coreFunil(
  etapas: MetaEtapa[],
  negocios: LinhaNegocioEtapa[],
  agora: Date,
): EtapaFunil[] {
  const porEtapa = new Map<
    string,
    { emAberto: number; valor: number; somaDias: number }
  >();
  for (const et of etapas) {
    porEtapa.set(et.id, { emAberto: 0, valor: 0, somaDias: 0 });
  }
  for (const n of negocios) {
    if (!n.etapaId) continue;
    const acc = porEtapa.get(n.etapaId);
    if (!acc) continue; // etapa inativa/fora de escopo — ignora
    acc.emAberto += 1;
    acc.valor += valorEfetivo(n.valor, n.valorAjustado);
    acc.somaDias += (agora.getTime() - n.entrouEtapaEm.getTime()) / MS_DIA;
  }
  return etapas
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((et) => {
      const acc = porEtapa.get(et.id)!;
      return {
        etapaId: et.id,
        nome: et.nome,
        ordem: et.ordem,
        emAberto: acc.emAberto,
        valorEmAberto: acc.valor,
        cicloMedioDias:
          acc.emAberto > 0
            ? Math.round((acc.somaDias / acc.emAberto) * 10) / 10
            : null,
      };
    });
}

export async function conversaoPorEtapa(
  j: Janela,
  finalidade: Finalidade | undefined,
  e: EscopoSupervisor = {},
  agora: Date = new Date(),
): Promise<EtapaFunil[]> {
  // Etapas ABERTAS (snapshot do funil) da finalidade (ou todas): VENDA/POS_VENDA
  // + AMBAS. tipo ABERTA (as terminais GANHO/PERDIDO não são degrau de funil).
  const etapas = await prisma.etapa.findMany({
    where: {
      ativo: true,
      tipo: "ABERTA",
      ...(finalidade
        ? { finalidade: { in: [finalidade, "AMBAS"] } }
        : {}),
    },
    select: { id: true, nome: true, ordem: true },
    orderBy: { ordem: "asc" },
  });
  const negocios = await prisma.negocio.findMany({
    where: { AND: [escopoNegocioWhere(e), { status: StatusNeg.ABERTO }] },
    select: {
      etapaId: true,
      entrouEtapaEm: true,
      valor: true,
      valorAjustado: true,
    },
  });
  return coreFunil(etapas, negocios, agora);
}

// Chave do limiar de SLA por etapa (mesma convenção de slaAlertas.ts).
export function chaveSla(
  finalidade: string | null | undefined,
  etapaId: string | null,
): string {
  return `${finalidade ?? ""}:${etapaId ?? ""}`;
}

// FONTE ÚNICA do limiar de "parado" (SPEC_SUPERVISOR_CONFIG §5, item 3): usa o
// SLA por (finalidade, etapa) de ConfigAlertaSla quando existe; senão cai no
// `paradoDiasPadrao` global. Painel e varredura chamam isto — não há duas
// definições. Retorna o limiar em ms e se veio do SLA.
export function limiarParadoMs(
  finalidade: string | null | undefined,
  etapaId: string | null,
  globalDias: number,
  slaMinPorChave?: Map<string, number>,
): { ms: number; viaSla: boolean } {
  const min = slaMinPorChave?.get(chaveSla(finalidade, etapaId));
  if (min != null) return { ms: min * 60_000, viaSla: true };
  return { ms: globalDias * MS_DIA, viaSla: false };
}

// Um negócio está "parado"? Caminho SLA usa `>=` (igual slaAlertas.ts); o
// caminho global mantém `>` (comportamento histórico do painel).
export function estaParado(
  entrouEtapaEm: Date,
  agora: Date,
  limiar: { ms: number; viaSla: boolean },
): boolean {
  const decorrido = agora.getTime() - entrouEtapaEm.getTime();
  return limiar.viaSla ? decorrido >= limiar.ms : decorrido > limiar.ms;
}

// CORE: negócios ABERTO parados além do limiar, agrupados por etapa. O limiar é
// resolvido por `limiarParadoMs` (SLA por etapa + fallback global) — fonte única
// com a varredura. Só etapas com ao menos 1 parado entram; mais parados primeiro.
const SEM_ETAPA = "(sem etapa)";
export function coreParados(
  etapas: MetaEtapa[],
  negocios: { etapaId: string | null; entrouEtapaEm: Date; finalidade?: string | null }[],
  limiarDias: number,
  agora: Date,
  slaMinPorChave?: Map<string, number>,
): ParadoPorEtapa[] {
  const nomePorId = new Map(etapas.map((e) => [e.id, e.nome]));
  const conta = new Map<string, number>();
  const viaSlaNaChave = new Map<string, boolean>();
  for (const n of negocios) {
    const limiar = limiarParadoMs(n.finalidade, n.etapaId, limiarDias, slaMinPorChave);
    if (!estaParado(n.entrouEtapaEm, agora, limiar)) continue;
    const chave = n.etapaId ?? "";
    conta.set(chave, (conta.get(chave) ?? 0) + 1);
    if (limiar.viaSla) viaSlaNaChave.set(chave, true);
  }
  const saida: ParadoPorEtapa[] = [];
  for (const [chave, parados] of conta) {
    saida.push({
      etapaId: chave || null,
      nome: chave ? nomePorId.get(chave) ?? SEM_ETAPA : SEM_ETAPA,
      parados,
      // limiarDias só é afirmável quando o grupo usou o limiar global (dias). Se
      // usou SLA (minutos por etapa), fica null — a UI omite o "+N d parado".
      limiarDias: viaSlaNaChave.get(chave) ? null : limiarDias,
    });
  }
  return saida.sort((a, b) => b.parados - a.parados);
}

// ───────────────────────── 3) Sem próximo passo ─────────────────────────

// CORE: dos abertos, quantos NÃO têm próximo passo agendado.
export function coreSemProximoPasso(
  totalAbertos: number,
  comProximo: number,
): SemProximoPassoResultado {
  const semProximo = Math.max(0, totalAbertos - comProximo);
  return {
    totalAbertos,
    semProximo,
    pct: totalAbertos > 0 ? semProximo / totalAbertos : null,
  };
}

export async function semProximoPasso(
  e: EscopoSupervisor = {},
  agora: Date = new Date(),
): Promise<SemProximoPassoResultado> {
  // A Prazo / VIP sao parking: fora desta metrica (nao contam como abertos nem
  // como "sem proximo passo").
  const foraParking = { etapa: { isNot: { nome: { in: ["A Prazo", "VIP"] } } } };
  const base = {
    AND: [escopoNegocioWhere(e), { status: StatusNeg.ABERTO }, foraParking],
  };
  const [totalAbertos, comProximo] = await Promise.all([
    prisma.negocio.count({ where: base }),
    prisma.negocio.count({
      where: {
        AND: [
          escopoNegocioWhere(e),
          { status: StatusNeg.ABERTO },
          foraParking,
          {
            lembretes: {
              some: { status: "PENDENTE", dataHora: { gte: agora } },
            },
          },
        ],
      },
    }),
  ]);
  return coreSemProximoPasso(totalAbertos, comProximo);
}

// ───────────────────────── 4) Cobertura de funil ─────────────────────────

// CORE: Σ(valorEfetivo × peso[temperatura]) ÷ meta restante (múltiplo).
export function coreCobertura(
  itens: { valor: number; temperatura: Temperatura }[],
  pesos: PesosCobertura,
  metaRestanteReais: number | null,
): CoberturaResultado {
  let ponderado = 0;
  for (const it of itens) ponderado += it.valor * (pesos[it.temperatura] ?? 0);
  ponderado = Math.round(ponderado * 100) / 100;
  const metaOk =
    metaRestanteReais !== null && metaRestanteReais > 0
      ? metaRestanteReais
      : null;
  return {
    ponderadoReais: ponderado,
    metaRestanteReais: metaOk,
    cobertura: metaOk ? Math.round((ponderado / metaOk) * 100) / 100 : null,
  };
}

export async function coberturaFunil(
  pesos: PesosCobertura,
  metaRestanteReais: number | null,
  e: EscopoSupervisor = {},
): Promise<CoberturaResultado> {
  const negocios = await prisma.negocio.findMany({
    where: { AND: [escopoNegocioWhere(e), { status: StatusNeg.ABERTO }] },
    select: { valor: true, valorAjustado: true, temperatura: true },
  });
  const itens = negocios.map((n) => ({
    valor: valorEfetivo(n.valor, n.valorAjustado),
    temperatura: n.temperatura,
  }));
  return coreCobertura(itens, pesos, metaRestanteReais);
}

// ───────────────────────── 5) Ganhos×perdas por origem ─────────────────────────

const SEM_ORIGEM = "(sem origem)";

export function rotuloOrigem(
  origem: string | null,
  anuncioTitulo: string | null,
): string {
  const o = (origem ?? "").trim();
  if (o) return o;
  const a = (anuncioTitulo ?? "").trim();
  if (a) return a;
  return SEM_ORIGEM;
}

// CORE: agrega as linhas (ganho/perda + origem + valor) por origem.
export function coreOrigens(
  linhas: { origem: string; resultado: "ganho" | "perda"; valor: number }[],
): OrigemResultado[] {
  const mapa = new Map<string, OrigemResultado>();
  for (const l of linhas) {
    let r = mapa.get(l.origem);
    if (!r) {
      r = {
        origem: l.origem,
        ganhos: 0,
        perdas: 0,
        valorGanho: 0,
        conversao: null,
      };
      mapa.set(l.origem, r);
    }
    if (l.resultado === "ganho") {
      r.ganhos += 1;
      r.valorGanho += l.valor;
    } else {
      r.perdas += 1;
    }
  }
  const saida = Array.from(mapa.values());
  for (const r of saida) {
    const fin = r.ganhos + r.perdas;
    r.conversao = fin > 0 ? r.ganhos / fin : null;
    r.valorGanho = Math.round(r.valorGanho * 100) / 100;
  }
  // Mais relevante primeiro: por valor ganho, depois volume.
  return saida.sort(
    (a, b) => b.valorGanho - a.valorGanho || b.ganhos + b.perdas - (a.ganhos + a.perdas),
  );
}

export async function ganhosPerdasPorOrigem(
  ganhos: { origem: string | null; anuncioTitulo: string | null; valor: number }[],
  perdas: { origem: string | null; anuncioTitulo: string | null }[],
): Promise<OrigemResultado[]> {
  const linhas: {
    origem: string;
    resultado: "ganho" | "perda";
    valor: number;
  }[] = [];
  for (const g of ganhos) {
    linhas.push({
      origem: rotuloOrigem(g.origem, g.anuncioTitulo),
      resultado: "ganho",
      valor: g.valor,
    });
  }
  for (const p of perdas) {
    linhas.push({
      origem: rotuloOrigem(p.origem, p.anuncioTitulo),
      resultado: "perda",
      valor: 0,
    });
  }
  return coreOrigens(linhas);
}

// Aprendizado do Supervisor (SPEC_SUPERVISOR_APRENDIZADO.md). Loop de feedback
// DETERMINÍSTICO (zero token, sem re-treino de modelo): lê o ledger de decisões
// do gestor (SupervisorAcao) + o resultado dos negócios + os padrões de produção
// (painel), e destila um SNAPSHOT de aprendizado guardado em
// SupervisorConfig.aprendizadoJson. O snapshot realimenta o chat (A2) e a
// priorização da varredura (A3).
//
// TRAVAS (o aprendizado não enfraquece nada): determinístico; NUNCA fala com
// cliente; NUNCA auto-edita config nem auto-desliga sinal (só SUGERE via insight);
// insight vem sempre de número real e é marcado por força de amostra.
import { prisma } from "../prisma";
import type { Prisma } from "../../generated/prisma/client";
import { StatusNeg } from "../../generated/prisma/enums";
import { montarPainel } from "./painel";
import { carregarConfigEditavel } from "./config";
import {
  AMOSTRA,
  APRENDIZADO_PADRAO,
  CADENCIA_ESTUDO_PADRAO,
  HISTORICO_MAX,
  nomeSinal,
  resolverAprendizado,
  type AceitacaoItem,
  type AprendizadoSnapshot,
  type ForcaInsight,
  type Insight,
  type PainelSupervisor,
  type SinalVarredura,
  type SucessoSinal,
} from "./tipos";

// Reexport para quem já importava de aprendizado (ia.ts). A definição canônica
// vive em tipos.ts (client-safe).
export { nomeSinal };

// Janela do ledger considerada no estudo (bounded; decisões muito antigas não
// descrevem a operação de hoje).
const JANELA_LEDGER_DIAS = 180;
// Janela de produção para as correlações (padrões do negócio).
const JANELA_PRODUCAO_DIAS = 90;

// ───────────────────────── puras (testadas em c7) ─────────────────────────

// Classifica o sinal de uma ação a partir do texto do motivo/nota. Os quatro
// motivos vêm de varredura.ts (fonte única); o resto é "outro".
export function classificarSinal(texto: string | null | undefined): SinalVarredura {
  const t = (texto ?? "").toLowerCase();
  if (!t) return "outro";
  if (t.includes("sem próximo passo") || t.includes("sem proximo passo")) return "semProximoPasso";
  if (t.includes("parado")) return "parado";
  if (t.includes("1ª resposta") || t.includes("1a resposta") || t.includes("primeira resposta")) return "primeiraResposta";
  if (t.includes("aguardando resposta") || t.includes("sem resposta")) return "semResposta";
  return "outro";
}

// EXECUTADO ÷ (EXECUTADO+DESCARTADO). null quando não há amostra.
export function taxaAceitacao(executadas: number, descartadas: number): number | null {
  const d = executadas + descartadas;
  return d > 0 ? executadas / d : null;
}

// Força do insight pelo tamanho da amostra.
export function forcaPorAmostra(n: number): ForcaInsight {
  if (n >= AMOSTRA.forte) return "forte";
  if (n >= AMOSTRA.media) return "media";
  return "fraca";
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

// Ordem default dos sinais da varredura (sem aprendizado) — mesma de antes.
const ORDEM_SINAIS_PADRAO: SinalVarredura[] = [
  "semProximoPasso",
  "parado",
  "semResposta",
  "primeiraResposta",
];

// Ordena os 4 sinais da varredura por ACEITAÇÃO aprendida (maior primeiro), para
// a varredura abrir primeiro as propostas do tipo que o gestor mais valoriza
// dentro do teto por ciclo. Sinal sem amostra = neutro (0.5): fica ACIMA de um
// sinal muito descartado (<0.5) e abaixo de um bem aceito. Sem aprendizado algum,
// todos neutros → preserva a ordem default (sort estável). Pura.
export function prioridadeSinais(ap: AprendizadoSnapshot): SinalVarredura[] {
  const taxa = new Map(ap.aceitacaoPorSinal.map((a) => [a.chave, a.taxa] as const));
  const chave = (s: SinalVarredura): number => {
    const t = taxa.get(s);
    return typeof t === "number" ? t : 0.5;
  };
  return [...ORDEM_SINAIS_PADRAO].sort((a, b) => chave(b) - chave(a));
}

// Entradas puras para montar os insights (números já computados).
export type EntradaInsights = {
  aceitacaoPorSinal: AceitacaoItem[];
  sucessoPorSinal: SucessoSinal[];
  // padrões de produção (do painel), já extraídos para forma simples.
  pctPrazo: { pct: number | null; total: number };
  melhorOrigem: { origem: string; conversao: number; amostra: number } | null;
  topMotivoPerda: { label: string; pctPerdidos: number; count: number } | null;
};

// Gera insights por REGRA a partir de números reais. Só emite quando a amostra
// atinge AMOSTRA.min; marca a força. Pura.
export function montarInsights(e: EntradaInsights): Insight[] {
  const out: Insight[] = [];

  // 1) Velocidade de 1ª resposta — a maior alavanca histórica.
  if (e.pctPrazo.pct !== null && e.pctPrazo.total >= AMOSTRA.min) {
    if (e.pctPrazo.pct < 0.5) {
      out.push({
        texto: `Só ${pct(e.pctPrazo.pct)} das 1ªs respostas saem no prazo — responder rápido é a maior alavanca de conversão.`,
        forca: forcaPorAmostra(e.pctPrazo.total),
      });
    } else if (e.pctPrazo.pct >= 0.8) {
      out.push({
        texto: `1ª resposta no prazo em ${pct(e.pctPrazo.pct)} dos casos — a equipe está rápida no topo do funil.`,
        forca: forcaPorAmostra(e.pctPrazo.total),
      });
    }
  }

  // 2) Melhor origem de conversão.
  if (e.melhorOrigem && e.melhorOrigem.amostra >= AMOSTRA.min) {
    out.push({
      texto: `Origem "${e.melhorOrigem.origem}" é a que mais converte (${pct(e.melhorOrigem.conversao)}) — vale priorizar.`,
      forca: forcaPorAmostra(e.melhorOrigem.amostra),
    });
  }

  // 3) Maior motivo de perda.
  if (e.topMotivoPerda && e.topMotivoPerda.count >= AMOSTRA.min) {
    out.push({
      texto: `Maior motivo de perda: "${e.topMotivoPerda.label}" (${Math.round(e.topMotivoPerda.pctPerdidos)}% dos perdidos) — atacar isso reduz a maior fuga.`,
      forca: forcaPorAmostra(e.topMotivoPerda.count),
    });
  }

  // 4) Aceitação por sinal (feed do A3: sugere desligar o que o gestor descarta).
  for (const a of e.aceitacaoPorSinal) {
    const amostra = a.executadas + a.descartadas;
    if (a.taxa === null || amostra < AMOSTRA.min || a.chave === "outro") continue;
    if (a.taxa < 0.3) {
      out.push({
        texto: `Você descarta quase tudo de "${nomeSinal(a.chave as SinalVarredura)}" (aceita só ${pct(a.taxa)}) — considere desligar esse item da varredura.`,
        forca: forcaPorAmostra(amostra),
      });
    } else if (a.taxa >= 0.7) {
      out.push({
        texto: `Sugestões de "${nomeSinal(a.chave as SinalVarredura)}" são bem aceitas (${pct(a.taxa)}) — mantê-las em alta prioridade.`,
        forca: forcaPorAmostra(amostra),
      });
    }
  }

  // 5) Sucesso por sinal (agir ajudou a ganhar?).
  for (const s of e.sucessoPorSinal) {
    if (s.taxa === null || s.executadas < AMOSTRA.min) continue;
    if (s.taxa >= 0.5) {
      out.push({
        texto: `Agir em "${nomeSinal(s.sinal)}" ajudou: ${pct(s.taxa)} desses negócios viraram ganho.`,
        forca: forcaPorAmostra(s.executadas),
      });
    }
  }

  // Mais fortes primeiro; teto de 6 para o contexto não inchar.
  const ordem: Record<ForcaInsight, number> = { forte: 0, media: 1, fraca: 2 };
  return out.sort((a, b) => ordem[a.forca] - ordem[b.forca]).slice(0, 6);
}

// Extrai os números de produção que os insights usam, a partir do painel. Pura.
export function extrairProducao(painel: PainelSupervisor): Pick<
  EntradaInsights,
  "pctPrazo" | "melhorOrigem" | "topMotivoPerda"
> {
  const melhor = painel.origens
    .filter((o) => o.conversao !== null && o.ganhos + o.perdas >= AMOSTRA.min)
    .sort((a, b) => (b.conversao ?? 0) - (a.conversao ?? 0))[0];
  const topMotivo = [...painel.perdas.porMotivo].sort((a, b) => b.count - a.count)[0];
  return {
    pctPrazo: { pct: painel.pctDentroDoPrazo.pct, total: painel.pctDentroDoPrazo.total },
    melhorOrigem: melhor
      ? { origem: melhor.origem, conversao: melhor.conversao ?? 0, amostra: melhor.ganhos + melhor.perdas }
      : null,
    topMotivoPerda: topMotivo
      ? { label: topMotivo.label, pctPerdidos: topMotivo.pct, count: topMotivo.count }
      : null,
  };
}

// ───────────────────────── leitura/escrita do snapshot ─────────────────────────

export async function carregarAprendizado(): Promise<AprendizadoSnapshot> {
  const row = await prisma.supervisorConfig
    .findFirst({ select: { aprendizadoJson: true }, orderBy: { atualizadoEm: "desc" } })
    .catch(() => null);
  return resolverAprendizado(row?.aprendizadoJson);
}

type DbCliente = typeof prisma | Prisma.TransactionClient;

// Grava SÓ o aprendizadoJson na linha única (não toca provider/modelo/limiares/
// varredura — update parcial). Cria a linha se ainda não existir.
export async function salvarAprendizado(
  snap: AprendizadoSnapshot,
  db: DbCliente = prisma,
): Promise<void> {
  const aprendizadoJson = snap as unknown as Prisma.InputJsonValue;
  const existente = await db.supervisorConfig.findFirst({
    select: { id: true },
    orderBy: { atualizadoEm: "desc" },
  });
  if (existente) {
    await db.supervisorConfig.update({ where: { id: existente.id }, data: { aprendizadoJson } });
  } else {
    await db.supervisorConfig.create({ data: { aprendizadoJson } });
  }
}

// ───────────────────────── estudo (determinístico) ─────────────────────────

// Recomputa o snapshot a partir dos sinais reais e salva. Idempotente (sempre
// recalcula do zero sobre o estado atual). Nunca lança para fora — em falha,
// devolve o snapshot anterior sem gravar.
export async function estudarAprendizado(agora: Date = new Date()): Promise<AprendizadoSnapshot> {
  const anterior = await carregarAprendizado();
  try {
    const corteLedger = new Date(agora.getTime() - JANELA_LEDGER_DIAS * 86_400_000);

    // 1) Ledger resolvido (aceito/descartado) no período.
    const acoes = await prisma.supervisorAcao.findMany({
      where: { status: { in: ["EXECUTADO", "DESCARTADO"] }, criadoEm: { gte: corteLedger } },
      select: { ferramenta: true, status: true, negocioId: true, argsJson: true },
    });

    // Acumuladores.
    const porSinal = new Map<SinalVarredura, { exec: number; desc: number }>();
    const porFerr = new Map<string, { exec: number; desc: number }>();
    let totExec = 0;
    let totDesc = 0;
    const execNegIds: { negocioId: string; sinal: SinalVarredura }[] = [];

    for (const a of acoes) {
      const executou = a.status === "EXECUTADO";
      if (executou) totExec++; else totDesc++;

      const ferr = porFerr.get(a.ferramenta) ?? { exec: 0, desc: 0 };
      ferr[executou ? "exec" : "desc"]++;
      porFerr.set(a.ferramenta, ferr);

      const nota = lerNota(a.argsJson);
      const sinal = classificarSinal(nota);
      const s = porSinal.get(sinal) ?? { exec: 0, desc: 0 };
      s[executou ? "exec" : "desc"]++;
      porSinal.set(sinal, s);

      if (executou && a.negocioId) execNegIds.push({ negocioId: a.negocioId, sinal });
    }

    // 2) Sucesso: dos negócios com ação EXECUTADA, quantos fecharam em GANHO.
    const ids = [...new Set(execNegIds.map((x) => x.negocioId))];
    const negs = ids.length
      ? await prisma.negocio.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } })
      : [];
    const statusPorNeg = new Map(negs.map((n) => [n.id, n.status]));
    const sucessoAcc = new Map<SinalVarredura, { ganhos: number; fechadas: number }>();
    for (const x of execNegIds) {
      const st = statusPorNeg.get(x.negocioId);
      if (st !== StatusNeg.GANHO && st !== StatusNeg.PERDIDO) continue; // ABERTO: ainda indefinido
      const acc = sucessoAcc.get(x.sinal) ?? { ganhos: 0, fechadas: 0 };
      acc.fechadas++;
      if (st === StatusNeg.GANHO) acc.ganhos++;
      sucessoAcc.set(x.sinal, acc);
    }

    // 3) Padrões de produção (painel 90d, toda a equipe) para os insights.
    const cfg = await carregarConfigEditavel();
    const janela = { inicio: new Date(agora.getTime() - JANELA_PRODUCAO_DIAS * 86_400_000), fim: agora };
    const painel = await montarPainel(janela, null, cfg.limiares, {}, agora);
    const producao = extrairProducao(painel);

    // 4) Monta as listas.
    const aceitacaoPorSinal: AceitacaoItem[] = [...porSinal.entries()].map(([sinal, v]) => ({
      chave: sinal,
      executadas: v.exec,
      descartadas: v.desc,
      taxa: taxaAceitacao(v.exec, v.desc),
    }));
    const aceitacaoPorFerramenta: AceitacaoItem[] = [...porFerr.entries()].map(([ferramenta, v]) => ({
      chave: ferramenta,
      executadas: v.exec,
      descartadas: v.desc,
      taxa: taxaAceitacao(v.exec, v.desc),
    }));
    const sucessoPorSinal: SucessoSinal[] = [...sucessoAcc.entries()].map(([sinal, v]) => ({
      sinal,
      executadas: v.fechadas,
      ganhos: v.ganhos,
      taxa: v.fechadas > 0 ? v.ganhos / v.fechadas : null,
    }));

    const insights = montarInsights({ aceitacaoPorSinal, sucessoPorSinal, ...producao });

    const aceitacaoGeral = taxaAceitacao(totExec, totDesc);
    const amostraTotal = totExec + totDesc;
    const geradoEm = agora.toISOString();

    const historico = [
      { geradoEm, aceitacaoGeral, amostra: amostraTotal },
      ...anterior.historico,
    ].slice(0, HISTORICO_MAX);

    const snap: AprendizadoSnapshot = {
      geradoEm,
      cadenciaHoras: anterior.cadenciaHoras || CADENCIA_ESTUDO_PADRAO,
      amostras: { acoes: amostraTotal, fechados: negs.filter((n) => n.status !== StatusNeg.ABERTO).length },
      aceitacaoPorSinal,
      aceitacaoPorFerramenta,
      sucessoPorSinal,
      insights,
      historico,
    };

    await salvarAprendizado(snap);
    return snap;
  } catch (e) {
    console.error(`[aprendizado] falha no estudo: ${e instanceof Error ? e.message : String(e)}`);
    return anterior.geradoEm ? anterior : APRENDIZADO_PADRAO;
  }
}

// Extrai o campo `nota` do argsJson (onde a varredura grava o motivo do sinal).
function lerNota(argsJson: unknown): string | null {
  if (argsJson && typeof argsJson === "object" && !Array.isArray(argsJson)) {
    const n = (argsJson as Record<string, unknown>).nota;
    if (typeof n === "string") return n;
  }
  return null;
}

// ───────────────────────── agendamento ─────────────────────────
let ultimoEstudoMs = 0;
let estudando = false;

// Gate por cadência: a cada tick, roda o estudo se já passou cadenciaHoras desde
// o último (lê a cadência da config viva). Roda MESMO com a varredura desligada
// (aprende do chat + histórico também). Determinístico, custo de token zero.
async function talvezEstudar(agora: Date = new Date()): Promise<void> {
  if (estudando) return;
  estudando = true;
  try {
    const snap = await carregarAprendizado().catch(() => null);
    const cadenciaMs = (snap?.cadenciaHoras || CADENCIA_ESTUDO_PADRAO) * 3_600_000;
    const ultimoConhecido = snap?.geradoEm ? Date.parse(snap.geradoEm) : 0;
    // Âncora: o maior entre o último estudo em memória e o persistido.
    const referencia = Math.max(ultimoEstudoMs, ultimoConhecido);
    if (referencia && agora.getTime() - referencia < cadenciaMs) return;
    ultimoEstudoMs = agora.getTime();
    const r = await estudarAprendizado(agora);
    console.log(`[aprendizado] estudo concluído: ${r.amostras.acoes} ação(ões), ${r.insights.length} insight(s).`);
  } catch (e) {
    console.error(`[aprendizado] falha no ticker: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    estudando = false;
  }
}

// Agenda o ticker (checa a cada 60s se está na hora de estudar). Chamado no boot.
export function iniciarAprendizadoSupervisor(): void {
  setInterval(() => void talvezEstudar(), 60_000);
}

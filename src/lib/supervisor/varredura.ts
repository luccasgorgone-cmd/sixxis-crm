// Varredura periódica do Supervisor (SPEC §5). DETERMINÍSTICA: examina os
// atendimentos por REGRA (sem LLM, custo de token zero), e para cada achado
// registra uma SupervisorAcao(PROPOSTO) — a ação fica pronta para o gestor
// confirmar com 1 clique. NUNCA executa nada sozinha; NUNCA fala com cliente.
//
// Papéis distintos: o slaAlertas (lib/slaAlertas.ts) avisa o VENDEDOR dono; esta
// varredura é a camada de GESTÃO (junta o que precisa de ação e deixa a proposta
// para o admin). Dedup: não recria proposta para um negócio que já tem uma
// proposta aberta da varredura.
import { prisma } from "../prisma";
import { carregarConfigEditavel } from "./config";
import { carregarAprendizado, prioridadeSinais } from "./aprendizado";
import { APRENDIZADO_PADRAO, type ConfigEditavel, type SinalVarredura } from "./tipos";
import { chaveSla, limiarParadoMs, estaParado } from "./indicadores";
import { StatusNeg } from "../../generated/prisma/enums";
import type { Prisma } from "../../generated/prisma/client";

// adminId sentinela das propostas automáticas (schema não tem FK em adminId).
// Permite distinguir e listar só o que a varredura abriu.
export const ORIGEM_VARREDURA = "varredura";

const CAP_POR_CICLO = 25; // teto de propostas novas por ciclo (evita enxurrada)
const TAKE_POR_SINAL = 40; // teto de candidatos consultados por sinal

type Candidato = { negocioId: string; motivo: string; sinal: SinalVarredura };

// Sugestão de ação ESPECÍFICA por sinal. Todas materializam como criar_lembrete
// (a única proposta sempre válida sem inferir etapa/vendedor alvo), mas o texto
// orienta o gestor para a ação certa daquele tipo de problema.
const SUGESTAO_POR_SINAL: Record<SinalVarredura, string> = {
  semProximoPasso: "Agendar o próximo passo com o cliente.",
  parado: "Revisar: avançar de etapa, reatribuir ou retomar o contato.",
  semResposta: "Responder o cliente — há mensagens aguardando.",
  primeiraResposta: "Responder agora — 1ª resposta atrasada.",
  outro: "Agendar contato.",
};

// Urgência por sinal: quão à frente agendar o lembrete (minutos relativos,
// recomputados na confirmação). Sinais urgentes (1ª resposta) vêm antes.
const MINUTOS_POR_SINAL: Record<SinalVarredura, number> = {
  primeiraResposta: 15,
  semResposta: 30,
  parado: 60,
  semProximoPasso: 60,
  outro: 60,
};

// ───────────────────────── detecções (read-only) ─────────────────────────

// Sinal 2 — sem próximo passo: ABERTO sem Lembrete PENDENTE futuro.
async function detSemProximoPasso(agora: Date): Promise<Candidato[]> {
  const negs = await prisma.negocio.findMany({
    where: {
      status: StatusNeg.ABERTO,
      // Fora das areas de parking (A Prazo / VIP): nao sao "sem proximo passo".
      etapa: { isNot: { nome: { in: ["A Prazo", "VIP"] } } },
      NOT: { lembretes: { some: { status: "PENDENTE", dataHora: { gte: agora } } } },
    },
    select: { id: true },
    orderBy: { entrouEtapaEm: "asc" },
    take: TAKE_POR_SINAL,
  });
  return negs.map((n) => ({ negocioId: n.id, motivo: "Sem próximo passo agendado", sinal: "semProximoPasso" as const }));
}

// Sinal 3 — parado além do limiar DA ETAPA. Reusa ConfigAlertaSla (fonte única,
// por finalidade+etapa, em minutos); onde não houver config, cai no limiar
// global `paradoDiasPadrao` da config do Supervisor.
async function detParado(agora: Date, cfg: ConfigEditavel): Promise<Candidato[]> {
  // MESMO limiar do painel: SLA por (finalidade,etapa) + fallback global, via o
  // helper único de indicadores.ts (sem segunda definição de "parado").
  const slas = await prisma.configAlertaSla.findMany({
    where: { ativo: true },
    select: { finalidade: true, etapaId: true, minutosParaAlerta: true },
  });
  const slaMin = new Map(slas.map((s) => [chaveSla(s.finalidade, s.etapaId), s.minutosParaAlerta]));

  const negs = await prisma.negocio.findMany({
    where: {
      status: StatusNeg.ABERTO,
      etapaId: { not: null },
      // A Prazo / VIP sao parking: nunca contam como "parado".
      etapa: { isNot: { nome: { in: ["A Prazo", "VIP"] } } },
    },
    select: { id: true, finalidade: true, etapaId: true, entrouEtapaEm: true, etapa: { select: { nome: true } } },
    orderBy: { entrouEtapaEm: "asc" },
    take: 200, // avalia um lote; corta para TAKE_POR_SINAL após o filtro
  });
  const out: Candidato[] = [];
  for (const n of negs) {
    if (!n.entrouEtapaEm) continue;
    const limiar = limiarParadoMs(n.finalidade, n.etapaId, cfg.limiares.paradoDiasPadrao, slaMin);
    if (estaParado(n.entrouEtapaEm, agora, limiar)) {
      const dias = Math.floor((agora.getTime() - n.entrouEtapaEm.getTime()) / 86_400_000);
      out.push({ negocioId: n.id, motivo: `Parado há ${dias} dia(s) em "${n.etapa?.nome ?? "etapa"}"`, sinal: "parado" });
      if (out.length >= TAKE_POR_SINAL) break;
    }
  }
  return out;
}

// Negócio ABERTO de um conjunto de leads+finalidade (para anexar a ação a um
// negócio real a partir de uma conversa). Retorna o 1º aberto por lead+final.
async function negociosAbertosPorConversa(
  chaves: { leadId: string; finalidade: string }[],
): Promise<Map<string, string>> {
  if (chaves.length === 0) return new Map();
  const leadIds = [...new Set(chaves.map((c) => c.leadId))];
  const negs = await prisma.negocio.findMany({
    where: {
      status: StatusNeg.ABERTO,
      leadId: { in: leadIds },
      // Nao anexa sinal (ex.: sem resposta) a card em parking (A Prazo / VIP).
      etapa: { isNot: { nome: { in: ["A Prazo", "VIP"] } } },
    },
    select: { id: true, leadId: true, finalidade: true },
  });
  const mapa = new Map<string, string>();
  for (const n of negs) {
    const k = `${n.leadId}:${n.finalidade}`;
    if (!mapa.has(k)) mapa.set(k, n.id);
  }
  return mapa;
}

// Sinal 1 — cliente sem resposta (HEURÍSTICA barata, sem varrer mensagem a
// mensagem): conversa não arquivada com mensagens não lidas (naoLidas>0) e
// parada há mais de `semRespostaHoras`. Anexa a proposta ao negócio aberto do
// lead/finalidade da conversa.
async function detSemResposta(agora: Date, cfg: ConfigEditavel): Promise<Candidato[]> {
  const corte = new Date(agora.getTime() - cfg.varredura.semRespostaHoras * 3_600_000);
  const convs = await prisma.conversa.findMany({
    where: { arquivada: false, naoLidas: { gt: 0 }, ultimaMensagemEm: { lte: corte } },
    select: { leadId: true, finalidade: true, ultimaMensagemEm: true },
    orderBy: { ultimaMensagemEm: "asc" },
    take: TAKE_POR_SINAL,
  });
  const mapa = await negociosAbertosPorConversa(convs.map((c) => ({ leadId: c.leadId, finalidade: c.finalidade })));
  const out: Candidato[] = [];
  for (const c of convs) {
    const negId = mapa.get(`${c.leadId}:${c.finalidade}`);
    if (negId) out.push({ negocioId: negId, motivo: "Cliente aguardando resposta (mensagens não lidas)", sinal: "semResposta" });
  }
  return out;
}

// Sinal 4 — 1ª resposta estourada: lead NOVO (negócio criado há pouco) cuja
// conversa segue com não lidas além do prazo de 1ª resposta. Heurística no mesmo
// espírito do sinal 1, restrita a negócios recém-criados.
async function detPrimeiraResposta(agora: Date, cfg: ConfigEditavel): Promise<Candidato[]> {
  const corteResp = new Date(agora.getTime() - cfg.limiares.prazo1aRespostaSeg * 1000);
  const corteNovo = new Date(agora.getTime() - 7 * 86_400_000); // "novo" = últimos 7 dias
  const novos = await prisma.negocio.findMany({
    where: { status: StatusNeg.ABERTO, criadoEm: { gte: corteNovo } },
    select: { id: true, leadId: true, finalidade: true },
    take: 200,
  });
  if (novos.length === 0) return [];
  const leadIds = [...new Set(novos.map((n) => n.leadId))];
  const convs = await prisma.conversa.findMany({
    where: { leadId: { in: leadIds }, arquivada: false, naoLidas: { gt: 0 }, ultimaMensagemEm: { lte: corteResp } },
    select: { leadId: true, finalidade: true },
  });
  const comEspera = new Set(convs.map((c) => `${c.leadId}:${c.finalidade}`));
  const out: Candidato[] = [];
  for (const n of novos) {
    if (comEspera.has(`${n.leadId}:${n.finalidade}`)) {
      out.push({ negocioId: n.id, motivo: "Lead novo sem 1ª resposta no prazo", sinal: "primeiraResposta" });
      if (out.length >= TAKE_POR_SINAL) break;
    }
  }
  return out;
}

// ───────────────────────── ciclo ─────────────────────────

export type ResumoVarredura = {
  rodou: boolean;
  motivo?: string;
  achados: number;
  criadas: number;
  pulados: number;
};

// Executa UM ciclo. Determinístico e idempotente por dedup. Nunca lança.
export async function executarVarredura(agora: Date = new Date()): Promise<ResumoVarredura> {
  let cfg: ConfigEditavel;
  try {
    cfg = await carregarConfigEditavel();
  } catch (e) {
    return { rodou: false, motivo: `falha ao ler config: ${e instanceof Error ? e.message : String(e)}`, achados: 0, criadas: 0, pulados: 0 };
  }
  if (!cfg.varredura.ativa) return { rodou: false, motivo: "desligada", achados: 0, criadas: 0, pulados: 0 };

  const v = cfg.varredura.vigia;
  // A3 — prioriza os sinais que o gestor mais aceita (aprendizado). Detectores
  // mapeados por sinal; rodamos na ordem de prioridade, então o "primeiro motivo
  // por negócio" (dedup abaixo) já favorece o tipo mais valorizado dentro do teto.
  const ap = await carregarAprendizado().catch(() => APRENDIZADO_PADRAO);
  const detectores: Record<SinalVarredura, (() => Promise<Candidato[]>) | null> = {
    semProximoPasso: v.semProximoPasso ? () => detSemProximoPasso(agora) : null,
    parado: v.parado ? () => detParado(agora, cfg) : null,
    semResposta: v.semResposta ? () => detSemResposta(agora, cfg) : null,
    primeiraResposta: v.primeiraResposta ? () => detPrimeiraResposta(agora, cfg) : null,
    outro: null,
  };
  const grupos: Candidato[][] = [];
  try {
    for (const sinal of prioridadeSinais(ap)) {
      const det = detectores[sinal];
      if (det) grupos.push(await det());
    }
  } catch (e) {
    return { rodou: true, motivo: `falha na detecção: ${e instanceof Error ? e.message : String(e)}`, achados: 0, criadas: 0, pulados: 0 };
  }

  // Um achado por negócio (o primeiro motivo encontrado), na ordem de prioridade.
  const porNegocio = new Map<string, { motivo: string; sinal: SinalVarredura }>();
  for (const g of grupos)
    for (const c of g)
      if (!porNegocio.has(c.negocioId))
        porNegocio.set(c.negocioId, { motivo: c.motivo, sinal: c.sinal });
  const achados = [...porNegocio.entries()].map(([negocioId, info]) => ({ negocioId, ...info }));

  if (achados.length === 0) return { rodou: true, achados: 0, criadas: 0, pulados: 0 };

  // Dedup: pula negócios que já têm proposta aberta da varredura.
  const ids = achados.map((a) => a.negocioId);
  const jaAbertas = await prisma.supervisorAcao.findMany({
    where: { status: "PROPOSTO", adminId: ORIGEM_VARREDURA, negocioId: { in: ids } },
    select: { negocioId: true },
  });
  const jaSet = new Set(jaAbertas.map((a) => a.negocioId));

  // leadId por negócio — permite deep-link da proposta para a conversa no Inbox.
  const negs = await prisma.negocio.findMany({
    where: { id: { in: ids } },
    select: { id: true, leadId: true },
  });
  const leadPorNeg = new Map(negs.map((n) => [n.id, n.leadId]));

  let criadas = 0;
  let pulados = 0;
  for (const a of achados) {
    if (jaSet.has(a.negocioId)) { pulados++; continue; }
    if (criadas >= CAP_POR_CICLO) { pulados++; continue; }
    // dataHoraRelativaMin (não um instante fixo): o lembrete é recomputado para
    // X min à frente NA HORA DA CONFIRMAÇÃO (urgência por sinal), então a proposta
    // nunca "vence" se o gestor demorar a confirmar (evita validar no passado).
    const minutos = MINUTOS_POR_SINAL[a.sinal];
    const args: Prisma.InputJsonValue = { negocioId: a.negocioId, dataHoraRelativaMin: minutos, nota: a.motivo };
    await prisma.supervisorAcao.create({
      data: {
        adminId: ORIGEM_VARREDURA,
        ferramenta: "criar_lembrete",
        argsJson: args,
        preview: `${a.motivo}. ${SUGESTAO_POR_SINAL[a.sinal]}`,
        status: "PROPOSTO",
        negocioId: a.negocioId,
        leadId: leadPorNeg.get(a.negocioId) ?? null,
        motivo: "varredura automática",
      },
    });
    criadas++;
  }
  return { rodou: true, achados: achados.length, criadas, pulados };
}

// ───────────────────────── agendamento ─────────────────────────
let ultimaExecucaoMs = 0;
let rodando = false;

// Gate por cadência: lê a config a cada tick e só roda quando ATIVA e já passou
// cadenciaMin desde a última execução — assim mudar a cadência na aba
// Configurações passa a valer sem reiniciar o servidor.
async function talvezRodar(): Promise<void> {
  if (rodando) return;
  rodando = true;
  try {
    const cfg = await carregarConfigEditavel().catch(() => null);
    if (!cfg || !cfg.varredura.ativa) return;
    const agora = Date.now();
    if (agora - ultimaExecucaoMs < cfg.varredura.cadenciaMin * 60_000) return;
    ultimaExecucaoMs = agora;
    const r = await executarVarredura(new Date(agora));
    if (r.criadas > 0) {
      console.log(`[varredura] ${r.criadas} proposta(s) nova(s), ${r.pulados} pulada(s), ${r.achados} achado(s)`);
    }
  } catch (e) {
    console.error(`[varredura] falha: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    rodando = false;
  }
}

// Agenda o ticker (a cada 60s checa se está na hora). Chamado no boot.
export function iniciarVarreduraSupervisor(): void {
  setInterval(() => void talvezRodar(), 60_000);
}

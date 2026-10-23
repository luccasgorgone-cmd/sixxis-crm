// Régua de follow-up automática (Manual secao 5). Move negócios ABERTO por PRAZO
// (Etapa.diasUteisMax, em dias ÚTEIS) para a próxima etapa da régua (por ordem) e,
// no fim da régua, para Perdido ("Sem resposta"). Ao mover, cria a PRÓXIMA AÇÃO
// (um Lembrete "enviar follow-up") para o dono. NUNCA envia mensagem ao cliente.
//
// Segurança: só age quando ConfiguracaoCRM.followupAtivo=true. Com false (default),
// roda em DRY-RUN: apenas registra em log o que FARIA, sem tocar em nada.
import { prisma } from "./prisma";
import { StatusNeg, TipoEtapa, TipoHistorico, Finalidade } from "../generated/prisma/enums";
import { diasUteisDecorridos, normalizarHorarios } from "./horario";
import { resolverAlertasNegocio } from "./slaAlertas";

const MOTIVO_SEM_RESPOSTA = "NAO_RESPONDE";

// Interação QUALIFICADA (Manual secao 6): conteúdo de compra. Heurística pura:
// pergunta de preço/frete/prazo/pagamento, pedido de link/orçamento, intenção de
// compra. NÃO conta "ok"/emoji/"vou ver". O vendedor pode sempre mover à mão
// (override manual) — isto só automatiza o caso óbvio.
const PADROES_QUALIFICADA: RegExp[] = [
  /\bpre[çc]o\b/i, /\bvalor(es)?\b/i, /quanto\s+(custa|fica|sai|é)/i,
  /\bfrete\b/i, /\bor[çc]amento\b/i, /\bcota[çc][ãa]o\b/i, /\blink\b/i,
  /\bprazo\b/i, /entrega/i, /\bparcel/i, /\bdesconto\b/i,
  /\bpix\b/i, /\bboleto\b/i, /cart[ãa]o/i, /\bpag(ar|amento|o)\b/i,
  /\bcomprar\b/i, /quero\s+(comprar|fechar|levar|o)/i, /\bfechar\b/i,
  /\bespecifica[çc]/i, /\bvoltagem\b/i, /\bmedida/i, /\bmodelo\b/i,
];

export function ehInteracaoQualificada(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const t = texto.trim();
  if (t.length < 2) return false;
  return PADROES_QUALIFICADA.some((re) => re.test(t));
}

// Pede preço/orçamento/link/pagamento -> destino "Negociando"; senão "Em atendimento".
const PADROES_NEGOCIANDO: RegExp[] = [
  /\bpre[çc]o\b/i, /\bvalor(es)?\b/i, /quanto\s+(custa|fica|sai|é)/i,
  /\bor[çc]amento\b/i, /\bcota[çc][ãa]o\b/i, /\blink\b/i, /\bfrete\b/i,
  /\bpix\b/i, /\bboleto\b/i, /cart[ãa]o/i, /\bpag(ar|amento)\b/i,
  /\bcomprar\b/i, /\bfechar\b/i, /\bdesconto\b/i,
];

// Regra de retorno: um negócio ABERTO numa etapa de FOLLOW-UP (régua) que recebe
// interação qualificada volta para "Em atendimento" (ou "Negociando" se pediu
// preço), uma única vez (limite 1). Só age com followupAtivo=true. Não envia nada.
export async function aplicarRetornoFollowup(
  leadId: string,
  finalidade: Finalidade,
  texto: string | null | undefined,
): Promise<void> {
  try {
    if (!ehInteracaoQualificada(texto)) return;
    const cfg = await prisma.configuracaoCRM.findFirst({ select: { followupAtivo: true } });
    if (cfg?.followupAtivo !== true) return;

    // Só etapas DA MESMA finalidade do negócio (ou AMBAS) — um negócio nunca
    // volta para uma etapa de outra finalidade mesmo que os nomes colidam.
    const etapas = await prisma.etapa.findMany({
      where: {
        ativo: true,
        tipo: TipoEtapa.ABERTA,
        finalidade: { in: [finalidade as never, "AMBAS" as never] },
      },
      select: { id: true, nome: true, ordem: true, diasUteisMax: true },
      orderBy: { ordem: "asc" },
    });
    const reguaOrdenada = etapas.filter((e) => e.diasUteisMax != null);
    if (reguaOrdenada.length < 2) return;
    const emAtendimento = reguaOrdenada[0]; // menor ordem da régua
    const idsFollowUp = new Set(reguaOrdenada.slice(1).map((e) => e.id)); // FU1/2/3

    const negocio = await prisma.negocio.findFirst({
      where: { leadId, finalidade, status: StatusNeg.ABERTO, etapaId: { in: [...idsFollowUp] } },
      select: { id: true, etapaId: true, vezesRetorno: true, agenteId: true },
    });
    if (!negocio) return;
    if (negocio.vezesRetorno >= 1) return; // limite 1; 2º só com aprovação do gestor

    const querNegociar = PADROES_NEGOCIANDO.some((re) => re.test(texto || ""));
    const negociando = etapas.find((e) => /negoci/i.test(e.nome));
    const destino = querNegociar && negociando ? negociando : emAtendimento;

    const agora = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.negocio.update({
        where: { id: negocio.id },
        data: { etapaId: destino.id, entrouEtapaEm: agora, vezesRetorno: { increment: 1 } },
      });
      await tx.historicoNegocio.create({
        data: {
          negocioId: negocio.id,
          tipo: TipoHistorico.ETAPA,
          descricao: `Retorno no follow-up (interação qualificada) → ${destino.nome}`,
        },
      });
    });
    await resolverAlertasNegocio(negocio.id);
  } catch (erro) {
    console.error(`[regua-retorno] falha: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

export async function processarReguaFollowup(): Promise<void> {
  try {
    const cfg = await prisma.configuracaoCRM.findFirst({
      select: { followupAtivo: true, horarios: true, feriados: true, fuso: true },
    });
    const ativo = cfg?.followupAtivo === true;
    const horarios = normalizarHorarios(cfg?.horarios);
    const feriados: string[] = Array.isArray(cfg?.feriados)
      ? (cfg!.feriados as unknown[]).filter((f): f is string => typeof f === "string")
      : [];
    const fuso = cfg?.fuso || "America/Sao_Paulo";
    const agora = new Date();

    // Etapas ABERTAS com prazo de régua, por finalidade, ordenadas.
    const etapas = await prisma.etapa.findMany({
      where: { ativo: true, tipo: TipoEtapa.ABERTA },
      select: { id: true, nome: true, ordem: true, finalidade: true, diasUteisMax: true },
      orderBy: { ordem: "asc" },
    });
    // Próxima etapa da régua (por ordem) = próxima ABERTA com diasUteisMax setado,
    // na mesma finalidade (ou AMBAS). Se não houver, o destino é Perdido.
    const proximaReguaPorEtapa = new Map<string, { id: string; nome: string } | null>();
    for (const e of etapas) {
      if (e.diasUteisMax == null) continue;
      const prox = etapas.find(
        (o) =>
          o.ordem > e.ordem &&
          o.diasUteisMax != null &&
          (o.finalidade === e.finalidade || o.finalidade === "AMBAS" || e.finalidade === "AMBAS"),
      );
      proximaReguaPorEtapa.set(e.id, prox ? { id: prox.id, nome: prox.nome } : null);
    }

    const etapasComPrazo = etapas.filter((e) => e.diasUteisMax != null).map((e) => e.id);
    if (etapasComPrazo.length === 0) return;

    const negocios = await prisma.negocio.findMany({
      where: { status: StatusNeg.ABERTO, etapaId: { in: etapasComPrazo } },
      select: {
        id: true, leadId: true, agenteId: true, finalidade: true,
        etapaId: true, entrouEtapaEm: true, status: true,
      },
    });

    for (const n of negocios) {
      if (!n.etapaId) continue;
      const etapa = etapas.find((e) => e.id === n.etapaId);
      if (!etapa || etapa.diasUteisMax == null) continue;
      const decorrido = diasUteisDecorridos(n.entrouEtapaEm, agora, horarios, feriados, fuso);
      if (decorrido < etapa.diasUteisMax) continue;

      const prox = proximaReguaPorEtapa.get(n.etapaId) ?? null;

      if (!ativo) {
        console.log(
          `[regua][dry-run] negocio ${n.id} em "${etapa.nome}" ha ${decorrido} dia(s) util(eis) (>= ${etapa.diasUteisMax}) -> ${prox ? `"${prox.nome}"` : "PERDIDO (Sem resposta)"}`,
        );
        continue;
      }

      if (prox) {
        await moverParaProximaEtapa(n, prox, etapa.nome);
      } else {
        await moverParaPerdido(n, etapa.nome, n.finalidade);
      }
    }
  } catch (erro) {
    console.error(`[regua] falha: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

async function moverParaProximaEtapa(
  n: { id: string; leadId: string; agenteId: string | null; finalidade: Finalidade },
  prox: { id: string; nome: string },
  etapaAtualNome: string,
): Promise<void> {
  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: n.id },
      data: { etapaId: prox.id, entrouEtapaEm: agora },
    });
    await tx.historicoNegocio.create({
      data: {
        negocioId: n.id,
        tipo: TipoHistorico.ETAPA,
        descricao: `Follow-up automático: ${etapaAtualNome} → ${prox.nome}`,
      },
    });
    if (n.agenteId) {
      await tx.lembrete.create({
        data: {
          leadId: n.leadId,
          negocioId: n.id,
          agenteId: n.agenteId,
          finalidade: n.finalidade,
          dataHora: agora,
          nota: `Enviar follow-up (${prox.nome}) até 14h`,
        },
      });
    }
  });
  await resolverAlertasNegocio(n.id);
}

async function moverParaPerdido(
  n: { id: string; leadId: string; agenteId: string | null; status: string },
  etapaAtualNome: string,
  finalidade: Finalidade,
): Promise<void> {
  const agora = new Date();
  // Etapa de Perdido DA MESMA finalidade do negócio (ou AMBAS) — nunca manda um
  // VENDA para a coluna de Perdido do POS_VENDA e vice-versa.
  const etapaPerdido = await prisma.etapa.findFirst({
    where: {
      tipo: TipoEtapa.PERDIDO,
      ativo: true,
      finalidade: { in: [finalidade as never, "AMBAS" as never] },
    },
    orderBy: { ordem: "asc" },
    select: { id: true },
  });
  const transicao = n.status !== StatusNeg.PERDIDO;
  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: n.id },
      data: {
        ...(etapaPerdido ? { etapaId: etapaPerdido.id } : {}),
        entrouEtapaEm: agora,
        status: StatusNeg.PERDIDO,
        fechadoEm: agora,
        motivoPerda: MOTIVO_SEM_RESPOSTA,
        desqualificado: false,
        jaFoiPerdido: true,
        ultimoMotivoPerda: MOTIVO_SEM_RESPOSTA,
        ultimaPerdaEm: agora,
        ...(transicao ? { vezesPerdido: { increment: 1 } } : {}),
      },
    });
    await tx.historicoNegocio.create({
      data: {
        negocioId: n.id,
        tipo: TipoHistorico.PERDA,
        descricao: `Perdido automaticamente ao fim da régua (Sem resposta) — saiu de "${etapaAtualNome}"`,
      },
    });
  });
  await resolverAlertasNegocio(n.id);
}

// Tick periódico (a cada 15 min). Chamado no boot. Em dry-run quando a flag off.
export function iniciarReguaFollowup(): void {
  void processarReguaFollowup();
  setInterval(() => void processarReguaFollowup(), 15 * 60 * 1000);
}

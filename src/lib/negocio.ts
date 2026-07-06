// Helpers de dominio do Negocio compartilhados por worker, backfill e APIs.
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { campoDono } from "./dono";
import {
  StatusNeg,
  TipoEtapa,
  Temperatura,
  TipoHistorico,
  Finalidade,
  FinalidadeEtapa,
} from "../generated/prisma/enums";

// Etapas elegiveis para uma finalidade: a propria + AMBAS.
function etapasDaFinalidade(finalidade: Finalidade): FinalidadeEtapa[] {
  return finalidade === Finalidade.VENDA
    ? [FinalidadeEtapa.VENDA, FinalidadeEtapa.AMBAS]
    : [FinalidadeEtapa.POS_VENDA, FinalidadeEtapa.AMBAS];
}

// Primeira etapa ABERTA do funil da finalidade (menor ordem).
export async function primeiraEtapaAberta(finalidade: Finalidade) {
  return prisma.etapa.findFirst({
    where: {
      tipo: TipoEtapa.ABERTA,
      ativo: true,
      finalidade: { in: etapasDaFinalidade(finalidade) },
    },
    orderBy: { ordem: "asc" },
  });
}

// Garante UM negocio aberto para o lead NAQUELA finalidade. Idempotente.
// Retorna o id do negocio aberto (existente ou criado) ou null se sem funil.
export async function garantirNegocioParaLead(
  leadId: string,
  finalidade: Finalidade = Finalidade.VENDA,
  emitir = true,
): Promise<string | null> {
  const existente = await prisma.negocio.findFirst({
    where: { leadId, finalidade, status: StatusNeg.ABERTO },
    select: { id: true },
  });
  if (existente) return existente.id;

  const etapa = await primeiraEtapaAberta(finalidade);
  if (!etapa) return null; // funil ainda nao configurado

  // Dono da finalidade -> agenteId do negocio (mesma regra do roteamento). Sem
  // isto, negocios criados por "Conversar"/cadastro manual nasciam ORFAOS
  // (agenteId null) e SUMIAM do Kanban do proprio colaborador, que filtra por
  // agenteId = ele. Fatia 3.07 (bug do card que nao aparecia sem F5). null quando
  // nao ha dono ainda (ex.: backfill) — segue o comportamento anterior.
  const leadDono = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { donoId: true, donoPosVendaId: true },
  });
  const agenteId = leadDono ? leadDono[campoDono(finalidade)] : null;

  // LEAD PERDIDO QUE VOLTA: sem negocio aberto, mas ha um PERDIDO na finalidade ->
  // REABRE o mesmo negocio (nao cria duplicata). Preserva TODO o historico: o
  // registro da PERDA (HistoricoNegocio.PERDA) e os rastreios continuam ligados a
  // este negocio; apenas volta a ficar ABERTO na 1a etapa e registra o retorno.
  const perdido = await prisma.negocio.findFirst({
    where: { leadId, finalidade, status: StatusNeg.PERDIDO },
    orderBy: { atualizadoEm: "desc" },
    select: { id: true, motivoPerda: true },
  });
  if (perdido) {
    const reaberto = await prisma.negocio.update({
      where: { id: perdido.id },
      data: {
        status: StatusNeg.ABERTO,
        etapaId: etapa.id,
        entrouEtapaEm: new Date(),
        fechadoEm: null,
        // Limpa o motivo (agora esta aberto); a PERDA anterior permanece no
        // HistoricoNegocio, entao o registro da perda NAO some.
        motivoPerda: null,
        motivoPerdaObs: null,
        // Reatribui ao dono da finalidade quando houver (nao apaga um agenteId ja
        // definido se o lead estiver sem dono no momento).
        ...(agenteId ? { agenteId } : {}),
        historicos: {
          create: {
            tipo: TipoHistorico.NOTA,
            descricao: `Cliente retornou apos perda${
              perdido.motivoPerda ? " (perda anterior preservada no historico)" : ""
            }`,
          },
        },
      },
      select: { id: true, etapaId: true },
    });
    if (emitir) {
      getIO()?.emit("negocio:atualizado", {
        negocioId: reaberto.id,
        etapaId: reaberto.etapaId,
        motivo: "reaberto",
      });
    }
    return reaberto.id;
  }

  const negocio = await prisma.negocio.create({
    data: {
      leadId,
      etapaId: etapa.id,
      agenteId,
      status: StatusNeg.ABERTO,
      temperatura: Temperatura.MORNO,
      finalidade,
      entrouEtapaEm: new Date(),
      historicos: {
        create: {
          tipo: TipoHistorico.CRIACAO,
          descricao: "Negocio criado a partir da conversa",
        },
      },
    },
    select: { id: true, etapaId: true },
  });

  if (emitir) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: negocio.id,
      etapaId: negocio.etapaId,
      motivo: "criado",
    });
  }
  return negocio.id;
}

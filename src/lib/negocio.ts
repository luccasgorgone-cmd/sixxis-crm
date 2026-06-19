// Helpers de dominio do Negocio compartilhados por worker, backfill e APIs.
import { prisma } from "./prisma";
import { getIO } from "./socket";
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

  const negocio = await prisma.negocio.create({
    data: {
      leadId,
      etapaId: etapa.id,
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

// Helpers de dominio do Negocio compartilhados por worker, backfill e APIs.
import { prisma } from "./prisma";
import { getIO } from "./socket";
import {
  StatusNeg,
  TipoEtapa,
  Temperatura,
  TipoHistorico,
} from "../generated/prisma/enums";

// Primeira etapa ABERTA do funil (menor ordem). null se o funil nao foi semeado.
export async function primeiraEtapaAberta() {
  return prisma.etapa.findFirst({
    where: { tipo: TipoEtapa.ABERTA, ativo: true },
    orderBy: { ordem: "asc" },
  });
}

// Garante UM negocio aberto para o lead. Idempotente: se ja existe um negocio
// ABERTO, nao cria outro. Registra HistoricoNegocio(CRIACAO).
// emitir=false no backfill de boot (evita enxurrada de eventos e io ainda nulo).
export async function garantirNegocioParaLead(
  leadId: string,
  emitir = true,
): Promise<void> {
  const existente = await prisma.negocio.findFirst({
    where: { leadId, status: StatusNeg.ABERTO },
    select: { id: true },
  });
  if (existente) return;

  const etapa = await primeiraEtapaAberta();
  if (!etapa) return; // funil ainda nao configurado

  const negocio = await prisma.negocio.create({
    data: {
      leadId,
      etapaId: etapa.id,
      status: StatusNeg.ABERTO,
      temperatura: Temperatura.MORNO,
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
}

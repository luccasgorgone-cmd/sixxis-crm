// Helpers compartilhados das ferramentas de escrita. Centraliza o snapshot do
// Negócio (para antes/depois + reverter), o log duplo (HistoricoNegocio na
// timeline do negócio + Atividade na timeline do cliente — exatamente como o
// PATCH /api/negocios/[id] faz) e o emit de tempo real do Kanban.
import { prisma } from "../../prisma";
import { getIO } from "../../socket";
import { StatusNeg } from "../../../generated/prisma/enums";
import type { Prisma } from "../../../generated/prisma/client";
import {
  TipoHistorico,
  AtividadeTipo,
} from "../../../generated/prisma/enums";

// Campos do Negócio que as ferramentas leem/alteram e que entram no snapshot
// `antes` para o reverter. Mantido enxuto de propósito.
export const SELECT_NEGOCIO = {
  id: true,
  leadId: true,
  agenteId: true,
  finalidade: true,
  status: true,
  etapaId: true,
  entrouEtapaEm: true,
  temperatura: true,
  pendente: true,
  motivoPendencia: true,
  motivoPendenciaCode: true,
  valor: true,
  valorAjustado: true,
  tipoGanho: true,
  fechadoEm: true,
  jaFoiGanho: true,
  ultimoGanhoEm: true,
  vezesGanho: true,
  jaFoiPerdido: true,
  motivoPerda: true,
  motivoPerdaObs: true,
  ultimoMotivoPerda: true,
  ultimoMotivoPerdaObs: true,
  ultimaPerdaEm: true,
  vezesPerdido: true,
  arquivado: true,
  arquivadoEm: true,
  arquivadoMotivo: true,
} satisfies Prisma.NegocioSelect;

export type NegocioSnapshot = Prisma.NegocioGetPayload<{
  select: typeof SELECT_NEGOCIO;
}>;

export function buscarNegocio(id: string): Promise<NegocioSnapshot | null> {
  return prisma.negocio.findUnique({
    where: { id },
    select: SELECT_NEGOCIO,
  });
}

// Normaliza o snapshot para JSON puro (Decimal -> number, Date -> ISO) para
// gravar em antesJson/depoisJson sem surpresa de serialização.
export function snapshot(n: NegocioSnapshot): Record<string, unknown> {
  return {
    id: n.id,
    leadId: n.leadId,
    agenteId: n.agenteId,
    finalidade: n.finalidade,
    status: n.status,
    etapaId: n.etapaId,
    entrouEtapaEm: n.entrouEtapaEm?.toISOString() ?? null,
    temperatura: n.temperatura,
    pendente: n.pendente,
    motivoPendencia: n.motivoPendencia,
    motivoPendenciaCode: n.motivoPendenciaCode,
    valor: n.valor != null ? Number(n.valor) : null,
    valorAjustado: n.valorAjustado != null ? Number(n.valorAjustado) : null,
    tipoGanho: n.tipoGanho,
    fechadoEm: n.fechadoEm?.toISOString() ?? null,
    jaFoiGanho: n.jaFoiGanho,
    ultimoGanhoEm: n.ultimoGanhoEm?.toISOString() ?? null,
    vezesGanho: n.vezesGanho,
    jaFoiPerdido: n.jaFoiPerdido,
    motivoPerda: n.motivoPerda,
    motivoPerdaObs: n.motivoPerdaObs,
    ultimoMotivoPerda: n.ultimoMotivoPerda,
    ultimoMotivoPerdaObs: n.ultimoMotivoPerdaObs,
    ultimaPerdaEm: n.ultimaPerdaEm?.toISOString() ?? null,
    vezesPerdido: n.vezesPerdido,
    arquivado: n.arquivado,
    arquivadoEm: n.arquivadoEm?.toISOString() ?? null,
    arquivadoMotivo: n.arquivadoMotivo,
  };
}

// Log duplo dentro de uma transação: HistoricoNegocio (timeline do negócio) +
// Atividade (timeline do cliente). Mesma dualidade do PATCH manual.
export async function logNegocio(
  tx: Prisma.TransactionClient,
  p: {
    negocioId: string;
    leadId: string;
    agenteId: string;
    tipoHistorico: keyof typeof TipoHistorico;
    tipoAtividade: keyof typeof AtividadeTipo;
    descricao: string;
    valorGanho?: number | null;
  },
): Promise<void> {
  await tx.historicoNegocio.create({
    data: {
      negocioId: p.negocioId,
      agenteId: p.agenteId,
      tipo: TipoHistorico[p.tipoHistorico],
      descricao: p.descricao,
      valorGanho: p.valorGanho ?? null,
    },
  });
  await tx.atividade.create({
    data: {
      leadId: p.leadId,
      negocioId: p.negocioId,
      agenteId: p.agenteId,
      tipo: AtividadeTipo[p.tipoAtividade],
      descricao: p.descricao,
    },
  });
}

// Formata reais para os textos de preview/log (mesma cara do fluxo manual).
export function brl(v: number | null | undefined): string {
  if (v == null) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Avisa o Kanban/Inbox em tempo real (mesmo evento do PATCH manual).
export function emitirNegocioAtualizado(
  negocioId: string,
  etapaId: string | null,
): void {
  getIO()?.emit("negocio:atualizado", {
    negocioId,
    etapaId,
    motivo: "supervisor",
  });
}

export { StatusNeg };

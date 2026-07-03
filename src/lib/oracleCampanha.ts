// Resolucao de SEGMENTO para as sugestoes de campanha do Oracle. SEMPRE no
// escopo do usuario (nao-admin so os proprios leads, por campoDono). Reusa os
// dados que o Oracle ja le. NAO cria nem dispara nada — so segmenta/conta.
import { prisma } from "./prisma";
import { ehAdmin, type SessaoAgente } from "./autorizacao";
import { campoDono } from "./dono";
import { StatusNeg, type Finalidade } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";
import { LIMITE_CAMPANHA } from "./campanha";

export type CriteriosSegmento = {
  finalidade: Finalidade;
  uf?: string | null;
  segmento?: "VAREJO" | "ATACADO" | null;
  // Leads que NAO compraram nos ultimos N dias (para reativacao).
  semCompraDias?: number | null;
};

// Monta o WhereInput do segmento aplicando o escopo do usuario.
function whereSegmento(agente: SessaoAgente, c: CriteriosSegmento): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    // Lead que pertence AO setor (tem negocio naquela finalidade).
    negocios: { some: { finalidade: c.finalidade } },
  };
  // ESCOPO: nao-admin so os proprios (dono da finalidade). Admin ve todos.
  if (!ehAdmin(agente.papel)) where[campoDono(c.finalidade)] = agente.id;
  if (c.uf) where.enderecos = { some: { uf: c.uf.toUpperCase() } };
  if (c.segmento === "VAREJO" || c.segmento === "ATACADO") where.segmento = c.segmento;
  if (c.semCompraDias && c.semCompraDias > 0) {
    const desde = new Date(Date.now() - c.semCompraDias * 24 * 60 * 60 * 1000);
    where.NOT = {
      negocios: {
        some: { finalidade: c.finalidade, status: StatusNeg.GANHO, fechadoEm: { gte: desde } },
      },
    };
  }
  return where;
}

// Conta quantos leads o segmento atinge no escopo do usuario (para o preview).
export async function contarSegmentoOracle(
  agente: SessaoAgente,
  c: CriteriosSegmento,
): Promise<number> {
  return prisma.lead.count({ where: whereSegmento(agente, c) });
}

// Resolve os leadIds do segmento (capados no LIMITE_CAMPANHA) para criar o
// rascunho. Continua escopado; o resolver de campanha reaplica o dono depois.
export async function leadIdsSegmentoOracle(
  agente: SessaoAgente,
  c: CriteriosSegmento,
): Promise<{ leadIds: string[]; truncado: boolean }> {
  const leads = await prisma.lead.findMany({
    where: whereSegmento(agente, c),
    select: { id: true },
    take: LIMITE_CAMPANHA + 1,
  });
  const truncado = leads.length > LIMITE_CAMPANHA;
  const leadIds = (truncado ? leads.slice(0, LIMITE_CAMPANHA) : leads).map((l) => l.id);
  return { leadIds, truncado };
}

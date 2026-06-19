// Serializa um Negocio (com includes) para o formato consumido pela UI do
// Kanban e do painel. Centraliza a conversao de Decimal -> number.
import type { Prisma } from "@/generated/prisma/client";

// Include padrao usado nas consultas que viram "card".
export const includeCard = {
  lead: {
    select: {
      nome: true,
      telefone: true,
      origem: true,
      etiquetas: { include: { etiqueta: true } },
    },
  },
  agente: { select: { id: true, nome: true, avatarUrl: true } },
  etapa: { select: { id: true, tipo: true } },
} satisfies Prisma.NegocioInclude;

type NegocioCard = Prisma.NegocioGetPayload<{ include: typeof includeCard }>;

export function cardNegocio(n: NegocioCard) {
  return {
    id: n.id,
    leadNome: n.lead.nome,
    leadTelefone: n.lead.telefone,
    origem: n.lead.origem,
    valor: n.valor != null ? Number(n.valor) : null,
    temperatura: n.temperatura,
    status: n.status,
    etapaId: n.etapaId,
    entrouEtapaEm: n.entrouEtapaEm,
    agente: n.agente
      ? { id: n.agente.id, nome: n.agente.nome, avatarUrl: n.agente.avatarUrl }
      : null,
    etiquetas: n.lead.etiquetas.map((le) => ({
      id: le.etiqueta.id,
      nome: le.etiqueta.nome,
      cor: le.etiqueta.cor,
    })),
  };
}

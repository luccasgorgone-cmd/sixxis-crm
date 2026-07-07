// Serializa um Negocio (com includes) para o formato consumido pela UI do
// Kanban e do painel. Centraliza a conversao de Decimal -> number.
import type { Prisma } from "@/generated/prisma/client";
import { nomeEfetivo } from "./cliente";
import { rotuloMotivo } from "./motivosPerda";
import { rotuloPendencia } from "./motivosPendencia";

// Include padrao usado nas consultas que viram "card".
export const includeCard = {
  lead: {
    select: {
      nome: true,
      pushName: true,
      nomeManual: true,
      fotoUrl: true,
      telefone: true,
      origem: true,
      // Garantia (pos-venda): marcador colorido no card de pos-venda.
      garantia: true,
      etiquetas: { include: { etiqueta: true } },
    },
  },
  agente: { select: { id: true, nome: true, avatarUrl: true } },
  etapa: { select: { id: true, tipo: true } },
  // Alertas de SLA abertos (selo/contador no card do kanban).
  alertasSla: { where: { resolvidoEm: null }, select: { id: true } },
} satisfies Prisma.NegocioInclude;

type NegocioCard = Prisma.NegocioGetPayload<{ include: typeof includeCard }>;

export function cardNegocio(n: NegocioCard) {
  return {
    id: n.id,
    leadNome: nomeEfetivo(n.lead),
    leadFoto: n.lead.fotoUrl,
    leadTelefone: n.lead.telefone,
    origem: n.lead.origem,
    // Pos-venda com desconto: mostra o valor REALMENTE cobrado (valorAjustado).
    // Em venda valorAjustado e sempre null -> cai no valor (conversao intocada).
    valor:
      n.valorAjustado != null
        ? Number(n.valorAjustado)
        : n.valor != null
          ? Number(n.valor)
          : null,
    temperatura: n.temperatura,
    status: n.status,
    finalidade: n.finalidade,
    garantia: n.lead.garantia,
    pendente: n.pendente,
    motivoPendencia: n.motivoPendencia,
    // Motivo estruturado da pendencia (Fatia 3.17): code + label; motivoPendencia
    // segue como observacao livre.
    motivoPendenciaCode: n.motivoPendenciaCode,
    motivoPendenciaLabel: n.motivoPendenciaCode ? rotuloPendencia(n.motivoPendenciaCode) : null,
    motivoPerda: n.motivoPerda,
    motivoPerdaLabel: n.motivoPerda ? rotuloMotivo(n.motivoPerda) : null,
    motivoPerdaObs: n.motivoPerdaObs,
    etapaId: n.etapaId,
    entrouEtapaEm: n.entrouEtapaEm,
    alertasSla: n.alertasSla.length,
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

// Resolucao de destinatarios de uma campanha: aplica escopo (dono/finalidade),
// filtro (status/etiqueta/etapa/pendente), opt-out (aceitaContato) e canal
// (telefone p/ WhatsApp e SMS, email p/ Email). Compartilhado por preview e
// criacao para garantir contagem identica.
import { prisma } from "./prisma";
import { campoDono } from "./dono";
import { nomeEfetivo } from "./cliente";
import {
  lojaConfigurada,
  clienteTemPedido,
  LIMITE_CHECK_LOJA,
} from "./integracaoLoja";
import { Finalidade, CanalEnvio } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";

export type FiltroCampanha = {
  status?: "ABERTO" | "GANHO" | "PERDIDO" | "todos";
  etiquetaId?: string | null;
  etapaId?: string | null;
  pendente?: boolean;
  temPedidoLoja?: boolean;
};

export type DestinoResolvido = {
  leadId: string;
  nomeEfetivo: string;
  empresa: string | null;
  telefone: string;
  destino: string;
};

export type ResolucaoCampanha = {
  incluidos: DestinoResolvido[];
  puladosOptOut: number;
  puladosSemCanal: number;
  // Filtro de loja ignorado por exceder o limite de verificacoes.
  lojaIgnorada?: boolean;
};

// Normaliza um filtro vindo de JSON (defensivo).
export function normalizarFiltro(v: unknown): FiltroCampanha {
  const o = (v ?? {}) as Record<string, unknown>;
  const status = o.status;
  return {
    status:
      status === "ABERTO" ||
      status === "GANHO" ||
      status === "PERDIDO" ||
      status === "todos"
        ? status
        : "todos",
    etiquetaId: typeof o.etiquetaId === "string" ? o.etiquetaId : null,
    etapaId: typeof o.etapaId === "string" ? o.etapaId : null,
    pendente: o.pendente === true,
    temPedidoLoja: o.temPedidoLoja === true,
  };
}

function destinoDoCanal(
  canal: CanalEnvio,
  lead: { telefone: string; email: string | null },
): string | null {
  if (canal === CanalEnvio.EMAIL) {
    return lead.email?.trim() || null;
  }
  const tel = lead.telefone.replace(/\D/g, "");
  return tel || null;
}

// Resolve a lista. todos=true (admin) ignora o dono; senao filtra por alvoId.
export async function resolverDestinatarios(opts: {
  finalidade: Finalidade;
  canal: CanalEnvio;
  filtro: FiltroCampanha;
  alvoId: string | null;
  todos: boolean;
}): Promise<ResolucaoCampanha> {
  const { finalidade, canal, filtro, alvoId, todos } = opts;
  const campo = campoDono(finalidade);

  const leadWhere: Prisma.LeadWhereInput = {};
  if (!todos && alvoId) leadWhere[campo] = alvoId;
  if (filtro.etiquetaId) {
    leadWhere.etiquetas = { some: { etiquetaId: filtro.etiquetaId } };
  }

  const negWhere: Prisma.NegocioWhereInput = { finalidade };
  if (Object.keys(leadWhere).length > 0) negWhere.lead = leadWhere;
  if (filtro.status && filtro.status !== "todos") negWhere.status = filtro.status;
  if (filtro.pendente) negWhere.pendente = true;
  if (filtro.etapaId) negWhere.etapaId = filtro.etapaId;

  const negocios = await prisma.negocio.findMany({
    where: negWhere,
    select: {
      lead: {
        select: {
          id: true,
          nome: true,
          pushName: true,
          nomeManual: true,
          telefone: true,
          email: true,
          empresa: true,
          aceitaContato: true,
        },
      },
    },
  });

  // Dedupe por lead (um lead pode ter mais de um negocio na finalidade).
  const vistos = new Set<string>();
  const incluidos: DestinoResolvido[] = [];
  let puladosOptOut = 0;
  let puladosSemCanal = 0;

  for (const n of negocios) {
    const lead = n.lead;
    if (vistos.has(lead.id)) continue;
    vistos.add(lead.id);

    if (!lead.aceitaContato) {
      puladosOptOut++;
      continue;
    }
    const destino = destinoDoCanal(canal, lead);
    if (!destino) {
      puladosSemCanal++;
      continue;
    }
    incluidos.push({
      leadId: lead.id,
      nomeEfetivo: nomeEfetivo(lead),
      empresa: lead.empresa,
      telefone: lead.telefone,
      destino,
    });
  }

  // Filtro opcional "tem pedido na loja" (so quando a ponte esta online e a
  // lista cabe no limite de verificacoes; senao ignora e sinaliza).
  if (filtro.temPedidoLoja && lojaConfigurada()) {
    if (incluidos.length > LIMITE_CHECK_LOJA) {
      return { incluidos, puladosOptOut, puladosSemCanal, lojaIgnorada: true };
    }
    const comPedido: DestinoResolvido[] = [];
    for (const d of incluidos) {
      if (await clienteTemPedido(d.telefone)) comPedido.push(d);
      else puladosSemCanal++; // pulado por nao atender ao filtro de loja
    }
    return { incluidos: comPedido, puladosOptOut, puladosSemCanal };
  }

  return { incluidos, puladosOptOut, puladosSemCanal };
}

// Limite de seguranca por campanha (anti-erro humano).
export const LIMITE_CAMPANHA = Number(process.env.CAMPANHA_LIMITE ?? 1000);

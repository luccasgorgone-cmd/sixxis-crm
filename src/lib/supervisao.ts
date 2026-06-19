// Consultas de supervisao do admin: contagem e listagem dos atendimentos de um
// colaborador, particionados em AO VIVO / PENDENTE / FINALIZADO.
import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";
import { StatusNeg } from "../generated/prisma/enums";
import { previewMensagem } from "./preview";
import type { Periodo } from "./metricas";

export type StatusAtendimento = "aovivo" | "pendente" | "finalizado";

function limite24h(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// Conversa aberta aguardando (nao lidas>0, sem resposta >24h ou nunca respondida).
function filtroPendente(): Prisma.ConversaWhereInput {
  return {
    OR: [
      { naoLidas: { gt: 0 } },
      { ultimaMensagemEm: { lt: limite24h() } },
      { ultimaMensagemEm: null },
    ],
  };
}

// Conversa aberta em andamento (respondida e recente).
function filtroAoVivo(): Prisma.ConversaWhereInput {
  return { naoLidas: 0, ultimaMensagemEm: { gte: limite24h() } };
}

export type ContagemAtendimentos = {
  aovivo: number;
  pendentes: number;
  finalizados: number;
  ultimoAtendimento: Date | null;
};

export async function contagemAtendimentos(
  agenteId: string,
  p: Periodo,
): Promise<ContagemAtendimentos> {
  const [aovivo, pendentes, finalizados, ultima] = await Promise.all([
    prisma.conversa.count({
      where: { agenteId, status: "aberta", ...filtroAoVivo() },
    }),
    prisma.conversa.count({
      where: { agenteId, status: "aberta", ...filtroPendente() },
    }),
    prisma.negocio.count({
      where: {
        agenteId,
        status: { in: [StatusNeg.GANHO, StatusNeg.PERDIDO] },
        fechadoEm: { gte: p.inicio, lt: p.fim },
      },
    }),
    prisma.conversa.findFirst({
      where: { agenteId },
      orderBy: { ultimaMensagemEm: "desc" },
      select: { ultimaMensagemEm: true },
    }),
  ]);
  return {
    aovivo,
    pendentes,
    finalizados,
    ultimoAtendimento: ultima?.ultimaMensagemEm ?? null,
  };
}

export type ItemAtendimento = {
  conversaId: string | null;
  leadId: string;
  negocioId: string | null;
  leadNome: string | null;
  leadTelefone: string;
  finalidade: string;
  preview: string | null;
  ultimaMensagemEm: Date | null;
  naoLidas: number;
  status: string; // ABERTO|GANHO|PERDIDO
  valor: number | null;
  etapaNome: string | null;
};

export async function listaAtendimentos(
  agenteId: string,
  status: StatusAtendimento,
  p: Periodo,
): Promise<ItemAtendimento[]> {
  if (status === "finalizado") {
    const negs = await prisma.negocio.findMany({
      where: {
        agenteId,
        status: { in: [StatusNeg.GANHO, StatusNeg.PERDIDO] },
        fechadoEm: { gte: p.inicio, lt: p.fim },
      },
      orderBy: { fechadoEm: "desc" },
      include: {
        lead: { select: { id: true, nome: true, telefone: true } },
        etapa: { select: { nome: true } },
      },
      take: 200,
    });
    // Resolve a conversa do lead para aquela finalidade (mais recente).
    const conv = await prisma.conversa.findMany({
      where: { leadId: { in: negs.map((n) => n.leadId) } },
      orderBy: { ultimaMensagemEm: "desc" },
      select: { id: true, leadId: true, finalidade: true },
    });
    const mapaConv = new Map<string, string>();
    for (const c of conv) {
      const k = `${c.leadId}|${c.finalidade}`;
      if (!mapaConv.has(k)) mapaConv.set(k, c.id);
    }
    return negs.map((n) => ({
      conversaId: mapaConv.get(`${n.leadId}|${n.finalidade}`) ?? null,
      leadId: n.leadId,
      negocioId: n.id,
      leadNome: n.lead.nome,
      leadTelefone: n.lead.telefone,
      finalidade: n.finalidade,
      preview: null,
      ultimaMensagemEm: n.fechadoEm,
      naoLidas: 0,
      status: n.status,
      valor: n.valor != null ? Number(n.valor) : null,
      etapaNome: n.etapa?.nome ?? null,
    }));
  }

  // aovivo | pendente: baseado nas conversas abertas do agente.
  const conversas = await prisma.conversa.findMany({
    where: {
      agenteId,
      status: "aberta",
      ...(status === "aovivo" ? filtroAoVivo() : filtroPendente()),
    },
    orderBy: { ultimaMensagemEm: "desc" },
    include: {
      lead: { select: { id: true, nome: true, telefone: true } },
      mensagens: {
        orderBy: { hora: "desc" },
        take: 1,
        select: { conteudo: true, tipo: true },
      },
    },
    take: 200,
  });

  // Resolve o negocio aberto (leadId+finalidade) de cada conversa.
  const negs = conversas.length
    ? await prisma.negocio.findMany({
        where: {
          status: StatusNeg.ABERTO,
          OR: conversas.map((c) => ({
            leadId: c.lead.id,
            finalidade: c.finalidade,
          })),
        },
        include: { etapa: { select: { nome: true } } },
      })
    : [];
  const mapaNeg = new Map(
    negs.map((n) => [`${n.leadId}|${n.finalidade}`, n]),
  );

  return conversas.map((c) => {
    const n = mapaNeg.get(`${c.lead.id}|${c.finalidade}`);
    const ultima = c.mensagens[0];
    return {
      conversaId: c.id,
      leadId: c.lead.id,
      negocioId: n?.id ?? null,
      leadNome: c.lead.nome,
      leadTelefone: c.lead.telefone,
      finalidade: c.finalidade,
      preview: ultima ? previewMensagem(ultima.tipo, ultima.conteudo) : null,
      ultimaMensagemEm: c.ultimaMensagemEm,
      naoLidas: c.naoLidas,
      status: n?.status ?? "ABERTO",
      valor: n?.valor != null ? Number(n.valor) : null,
      etapaNome: n?.etapa?.nome ?? null,
    };
  });
}

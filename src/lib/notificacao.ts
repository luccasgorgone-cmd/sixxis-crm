// Centro de notificacoes: cria Notificacao para um agente e avisa o front em
// tempo real. Usado por jobs (aniversarios, alertas de tarefa/lembrete) e fluxos
// que queiram notificar o dono de um cliente.
import { prisma } from "./prisma";
import { getIO } from "./socket";

export type NovaNotificacao = {
  agenteId: string;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  link?: string | null;
  leadId?: string | null;
};

// Cria a notificacao e emite "notificacao:nova" (cada cliente revalida o proprio
// contador, que e escopado ao agente logado).
export async function criarNotificacao(n: NovaNotificacao): Promise<void> {
  await prisma.notificacao.create({
    data: {
      agenteId: n.agenteId,
      tipo: n.tipo,
      titulo: n.titulo,
      descricao: n.descricao ?? null,
      link: n.link ?? null,
      leadId: n.leadId ?? null,
    },
  });
  getIO()?.emit("notificacao:nova", { agenteId: n.agenteId });
}

// Cria a notificacao apenas se ainda nao houver uma do mesmo agente/tipo/lead
// criada a partir de `desde` (idempotencia para jobs diarios/periodicos).
// Retorna true se criou.
export async function criarNotificacaoUnica(
  n: NovaNotificacao,
  desde: Date,
): Promise<boolean> {
  const ja = await prisma.notificacao.findFirst({
    where: {
      agenteId: n.agenteId,
      tipo: n.tipo,
      leadId: n.leadId ?? null,
      criadoEm: { gte: desde },
    },
    select: { id: true },
  });
  if (ja) return false;
  await criarNotificacao(n);
  return true;
}

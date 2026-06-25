// Helpers de autorizacao por papel, usados pelas rotas de API de negocio.
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Papel } from "@/generated/prisma/enums";

export type SessaoAgente = {
  id: string;
  papel: Papel;
  nome: string | null;
};

// Retorna o agente da sessao ou null (deslogado).
export async function obterAgente(): Promise<SessaoAgente | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    papel: session.user.papel,
    nome: session.user.name ?? null,
  };
}

export function ehAdmin(papel: Papel): boolean {
  return papel === Papel.ADMIN;
}

// Retorna o agente da sessao apenas se for ADMIN; senao null. Atalho para as
// rotas de /api/admin (defesa em profundidade, alem do middleware).
export async function obterAdmin(): Promise<SessaoAgente | null> {
  const agente = await obterAgente();
  if (!agente || !ehAdmin(agente.papel)) return null;
  return agente;
}

// O agente pode gerenciar este lead (dados do cliente)? Admin, dono (venda/pos)
// ou agente de alguma conversa do lead. Usado pelas rotas lead-scoped.
export async function podeGerenciarLead(
  agente: SessaoAgente,
  leadId: string,
): Promise<boolean> {
  if (ehAdmin(agente.papel)) return true;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      donoId: true,
      donoPosVendaId: true,
      conversas: { select: { agenteId: true } },
    },
  });
  if (!lead) return false;
  return (
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id ||
    lead.conversas.some((c) => c.agenteId === agente.id)
  );
}

// VENDEDOR/POS_VENDA so podem agir sobre negocios proprios.
export function podeAcessarNegocio(
  agente: SessaoAgente,
  negocioAgenteId: string | null,
): boolean {
  if (ehAdmin(agente.papel)) return true;
  return negocioAgenteId === agente.id;
}

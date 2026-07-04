// Helpers de autorizacao por papel, usados pelas rotas de API de negocio.
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Papel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type SessaoAgente = {
  id: string;
  papel: Papel;
  nome: string | null;
  acessoVenda: boolean;
  acessoPosVenda: boolean;
};

// Retorna o agente da sessao ou null (deslogado).
export async function obterAgente(): Promise<SessaoAgente | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    papel: session.user.papel,
    nome: session.user.name ?? null,
    acessoVenda: session.user.acessoVenda ?? false,
    acessoPosVenda: session.user.acessoPosVenda ?? false,
  };
}

export function ehAdmin(papel: Papel): boolean {
  return papel === Papel.ADMIN;
}

// Acesso a ferramentas de POS-VENDA (Local, Parceiros): admin, papel POS_VENDA
// ou quem tem a flag acessoPosVenda (ex.: usuario com venda + pos-venda).
export function podePosVenda(agente: SessaoAgente): boolean {
  return (
    agente.papel === Papel.ADMIN ||
    agente.papel === Papel.POS_VENDA ||
    agente.acessoPosVenda
  );
}

// Escopo canonico de leads por dono (mesmo padrao do /api/clientes):
// - colaborador (VENDEDOR/POS_VENDA): so os seus (donoId OU donoPosVendaId = ele);
//   os params agenteId/semDono sao IGNORADOS (nao pode escalar vendo os de outro).
// - admin: ve tudo; ?semDono=1 -> orfaos (sem dono de venda nem pos-venda);
//   ?agenteId=X -> so os daquele vendedor; sem param -> todos.
// Retorna o WhereInput de escopo (sozinho, ou combinavel via AND com filtros).
export function escopoLeadWhere(
  agente: SessaoAgente,
  sp: URLSearchParams,
): Prisma.LeadWhereInput {
  if (!ehAdmin(agente.papel)) {
    return { OR: [{ donoId: agente.id }, { donoPosVendaId: agente.id }] };
  }
  if (sp.get("semDono") === "1") {
    return { donoId: null, donoPosVendaId: null };
  }
  const agenteId = sp.get("agenteId");
  if (agenteId) {
    return { OR: [{ donoId: agenteId }, { donoPosVendaId: agenteId }] };
  }
  return {};
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

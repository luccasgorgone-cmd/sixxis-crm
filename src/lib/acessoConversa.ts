// Regra PURA de acesso a uma conversa (ler mensagens, enviar, fixar, marcar).
// Mesma regra ja usada em apagar/reagir/editar mensagem e no escopo da inbox:
// ADMIN ve tudo; colaborador (VENDEDOR/POS_VENDA) so a conversa em que e o
// atendente, ou cujo cliente e dele (dono de venda ou de pos-venda).
// Sem imports de banco/auth para o contrato C19 rodar puro.
export type AgenteAcesso = { id: string; papel: string };

export type ConversaAcesso = {
  agenteId: string | null;
  lead: { donoId: string | null; donoPosVendaId: string | null } | null;
};

export function podeAcessarConversa(
  agente: AgenteAcesso,
  conversa: ConversaAcesso,
): boolean {
  if (agente.papel === "ADMIN") return true;
  if (!agente.id) return false;
  if (conversa.agenteId === agente.id) return true;
  const lead = conversa.lead;
  if (!lead) return false;
  return lead.donoId === agente.id || lead.donoPosVendaId === agente.id;
}

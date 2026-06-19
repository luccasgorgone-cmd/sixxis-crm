// Helpers de propriedade (dono) do cliente por finalidade.
// O dono de VENDA fica em Lead.donoId; o de POS_VENDA em Lead.donoPosVendaId.
// O dono e espelhado em Conversa.agenteId (das conversas abertas DAQUELA
// finalidade) para que o "meus" do inbox bata com o do Kanban.
import { Finalidade, Papel } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";

// Cliente que funciona tanto com prisma quanto dentro de uma transacao (tx).
type ClientePrisma = Prisma.TransactionClient;

export function campoDono(finalidade: Finalidade): "donoId" | "donoPosVendaId" {
  return finalidade === Finalidade.VENDA ? "donoId" : "donoPosVendaId";
}

export function campoPonteiro(
  finalidade: Finalidade,
): "ponteiroAgenteId" | "ponteiroPosVendaId" {
  return finalidade === Finalidade.VENDA
    ? "ponteiroAgenteId"
    : "ponteiroPosVendaId";
}

export function papelDaFinalidade(finalidade: Finalidade): Papel {
  return finalidade === Finalidade.VENDA ? Papel.VENDEDOR : Papel.POS_VENDA;
}

// Espelha o dono nas conversas abertas do lead naquela finalidade.
export async function espelharDonoNasConversas(
  client: ClientePrisma,
  leadId: string,
  finalidade: Finalidade,
  agenteId: string | null,
): Promise<void> {
  await client.conversa.updateMany({
    where: { leadId, finalidade, arquivada: false },
    data: { agenteId },
  });
}

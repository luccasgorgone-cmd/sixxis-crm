// Conversa UNIFICADA por (leadId, finalidade): no maximo UMA conversa ATIVA por
// cliente+setor. Todos os numeros do mesmo setor caem nela; venda e pos-venda
// seguem como threads separadas (cada uma com seu dono). Conversas arquivadas
// antigas sao preservadas (historico) — nunca deletadas — e REABERTAS aqui em
// vez de criar uma segunda. Usado pela ingestao, pelo envio em massa e por
// qualquer fluxo que precise garantir a conversa do setor.
import { prisma } from "./prisma";
import { Prisma } from "../generated/prisma/client";
import type { Finalidade } from "../generated/prisma/enums";

type ConversaUnificada = Prisma.ConversaGetPayload<Record<string, never>>;

// Garante a conversa unificada do (leadId, finalidade): reabre a existente
// (inclusive arquivada) ou cria uma nova. Nunca cria uma segunda do mesmo setor.
export async function garantirConversaUnificada(
  leadId: string,
  finalidade: Finalidade,
  padrao?: { instancia?: string | null; instanciaId?: string | null },
): Promise<ConversaUnificada> {
  let conversa = await prisma.conversa.findFirst({
    where: { leadId, finalidade },
    orderBy: [{ arquivada: "asc" }, { ultimaMensagemEm: "desc" }],
  });
  if (!conversa) {
    try {
      conversa = await prisma.conversa.create({
        data: {
          leadId,
          finalidade,
          ...(padrao?.instancia ? { instancia: padrao.instancia } : {}),
          instanciaId: padrao?.instanciaId ?? null,
        },
      });
    } catch (erro) {
      // Corrida: o indice unico parcial (WHERE arquivada=false) garante uma so.
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === "P2002"
      ) {
        conversa = await prisma.conversa.findFirstOrThrow({
          where: { leadId, finalidade },
          orderBy: [{ arquivada: "asc" }, { ultimaMensagemEm: "desc" }],
        });
      } else {
        throw erro;
      }
    }
  } else if (conversa.arquivada || conversa.status !== "aberta") {
    conversa = await prisma.conversa.update({
      where: { id: conversa.id },
      data: { arquivada: false, status: "aberta" },
    });
  }
  return conversa;
}

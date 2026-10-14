// arquivar_negocio — tira o card do Kanban (e a conversa do Inbox) sem apagar
// nada, igual ao "Encerrar" manual (POST /api/negocios/[id]/encerrar): usa o
// mesmo arquivarNegociosEConversas(..., ARQUIVO_MANUAL) + rastro duplo
// (HistoricoNegocio/Atividade tipo NOTA). O reverter restaura os booleanos do
// snapshot e reabre a conversa (desarquivarConversaDoLead).
import { Finalidade } from "../../../generated/prisma/enums";
import {
  arquivarNegociosEConversas,
  desarquivarConversaDoLead,
  ARQUIVO_MANUAL,
} from "../../arquivamento";
import { prisma } from "../../prisma";
import {
  buscarNegocio,
  emitirNegocioAtualizado,
  logNegocio,
  snapshot,
} from "./comum";
import {
  lerId,
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };
  if (negocio.arquivado) {
    return { ok: false, erro: "o negócio já está arquivado" };
  }
  return { ok: true };
}

async function preview(): Promise<string> {
  return "Arquivar: tira o card do Kanban e a conversa do Inbox (nada é apagado; reabre se o cliente voltar a falar).";
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };
  if (negocio.arquivado) {
    return { ok: false, erro: "o negócio já está arquivado", antes: null, depois: null };
  }

  const antes = snapshot(negocio);
  const r = await arquivarNegociosEConversas({ id: negocioId }, ARQUIVO_MANUAL);
  if (r.total === 0) {
    // Corrida: alguém arquivou entre a leitura e o update.
    return { ok: false, erro: "o negócio já estava arquivado", antes, depois: null };
  }

  // Rastro best-effort (o card já saiu do quadro; falhar no log não desfaz).
  try {
    await prisma.$transaction(async (tx) => {
      await logNegocio(tx, {
        negocioId,
        leadId: negocio.leadId,
        agenteId: admin.id,
        tipoHistorico: "NOTA",
        tipoAtividade: "NOTA",
        descricao: "Atendimento arquivado pelo supervisor (sem desfecho de venda)",
      });
    });
  } catch {
    // ignora: arquivamento já efetivado
  }

  emitirNegocioAtualizado(negocioId, negocio.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes, depois, negocioId, leadId: negocio.leadId };
}

async function reverter(
  registro: RegistroAcao,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const antes = registro.antesJson as ReturnType<typeof snapshot> | null;
  if (!antes || !registro.negocioId) {
    return { ok: false, erro: "sem snapshot para reverter", antes: null, depois: null };
  }
  const negocioId = registro.negocioId;
  const atual = await buscarNegocio(negocioId);
  if (!atual) return { ok: false, erro: "negócio não encontrado", antes: null, depois: null };

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: {
        arquivado: Boolean(antes.arquivado),
        arquivadoEm: antes.arquivadoEm ? new Date(antes.arquivadoEm as string) : null,
        arquivadoMotivo: (antes.arquivadoMotivo as string | null) ?? null,
      },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: atual.leadId,
      agenteId: admin.id,
      tipoHistorico: "NOTA",
      tipoAtividade: "NOTA",
      descricao: "Arquivamento revertido (supervisor)",
    });
  });

  // Reabre a conversa no Inbox (best-effort, respeita índice único parcial).
  if (!antes.arquivado) {
    await desarquivarConversaDoLead(
      atual.leadId,
      atual.finalidade as unknown as Finalidade,
    );
  }

  emitirNegocioAtualizado(negocioId, atual.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes: registro.antesJson as Record<string, unknown>, depois };
}

export const arquivarNegocio: FerramentaEscrita = {
  nome: "arquivar_negocio",
  titulo: "Arquivar negócio",
  descricao:
    "Tira o negócio do Kanban e a conversa do Inbox sem apagar nada (reabre se o cliente voltar a falar). Equivale ao 'Encerrar' manual.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio a arquivar" },
    },
    required: ["negocioId"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

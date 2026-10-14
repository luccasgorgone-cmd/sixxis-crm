// reatribuir_vendedor — passa um negócio (e o cliente, naquela finalidade) para
// outro vendedor. Replica a transferência individual (a mesma lógica de
// /api/leads/transferir-massa): reatribui o dono da finalidade no Lead, o
// agenteId do Negócio e espelha nas conversas abertas, com HistoricoNegocio
// (ATRIBUICAO) + Atividade (TRANSFERENCIA). O `antes` guarda o dono anterior do
// lead além do snapshot do negócio para o reverter voltar os dois.
import { prisma } from "../../prisma";
import { Finalidade } from "../../../generated/prisma/enums";
import {
  campoDono,
  temAcesso,
  espelharDonoNasConversas,
} from "../../dono";
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

async function buscarAgente(id: string) {
  return prisma.agente.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      ativo: true,
      acessoVenda: true,
      acessoPosVenda: true,
    },
  });
}

function donoDoLead(
  lead: { donoId: string | null; donoPosVendaId: string | null },
  finalidade: Finalidade,
): string | null {
  return finalidade === Finalidade.VENDA ? lead.donoId : lead.donoPosVendaId;
}

async function lerLeadDono(leadId: string) {
  return prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      donoId: true,
      donoPosVendaId: true,
      dono: { select: { nome: true } },
      donoPosVenda: { select: { nome: true } },
    },
  });
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  const agenteId = lerId(args, "agenteId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  if (!agenteId) return { ok: false, erro: "agenteId (destino) é obrigatório" };

  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };

  const destino = await buscarAgente(agenteId);
  if (!destino) return { ok: false, erro: "vendedor destino não encontrado" };
  if (!destino.ativo) return { ok: false, erro: "vendedor destino está inativo" };
  if (!temAcesso(destino, negocio.finalidade as unknown as Finalidade)) {
    return { ok: false, erro: "vendedor destino não tem acesso a essa finalidade" };
  }
  if (negocio.agenteId === destino.id) {
    return { ok: false, erro: "o negócio já é desse vendedor" };
  }
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const negocioId = lerId(args, "negocioId");
  const agenteId = lerId(args, "agenteId");
  const negocio = negocioId ? await buscarNegocio(negocioId) : null;
  const destino = agenteId ? await buscarAgente(agenteId) : null;
  const atual = negocio?.agenteId
    ? await buscarAgente(negocio.agenteId)
    : null;
  const de = atual?.nome ?? "sem dono";
  const para = destino?.nome ?? "(vendedor)";
  return `Transferir negócio de ${de} para ${para}.`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const agenteId = lerId(args, "agenteId")!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };
  const destino = await buscarAgente(agenteId);
  if (!destino) return { ok: false, erro: "vendedor sumiu", antes: null, depois: null };

  const finalidade = negocio.finalidade as unknown as Finalidade;
  const campo = campoDono(finalidade);
  const lead = await lerLeadDono(negocio.leadId);
  const donoAntes = lead ? donoDoLead(lead, finalidade) : null;
  const nomeDe =
    (finalidade === Finalidade.VENDA
      ? lead?.dono?.nome
      : lead?.donoPosVenda?.nome) ?? "sem dono";
  const descricao = `Transferido de ${nomeDe} para ${destino.nome} (supervisor)`;

  const antes = {
    negocio: snapshot(negocio),
    leadDonoAntes: donoAntes,
    campoDono: campo,
    finalidade,
  };

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: negocio.leadId },
      data: { [campo]: destino.id },
    });
    await tx.negocio.update({
      where: { id: negocioId },
      data: { agenteId: destino.id },
    });
    await espelharDonoNasConversas(tx, negocio.leadId, finalidade, destino.id);
    await logNegocio(tx, {
      negocioId,
      leadId: negocio.leadId,
      agenteId: admin.id,
      tipoHistorico: "ATRIBUICAO",
      tipoAtividade: "TRANSFERENCIA",
      descricao,
    });
  });

  emitirNegocioAtualizado(negocioId, negocio.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes, depois, negocioId, leadId: negocio.leadId };
}

async function reverter(
  registro: RegistroAcao,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const antes = registro.antesJson as {
    negocio?: ReturnType<typeof snapshot>;
    leadDonoAntes?: string | null;
    campoDono?: "donoId" | "donoPosVendaId";
    finalidade?: Finalidade;
  } | null;
  if (!antes?.negocio || !antes.campoDono || !antes.finalidade || !registro.negocioId) {
    return { ok: false, erro: "snapshot incompleto para reverter", antes: null, depois: null };
  }
  const negocioId = registro.negocioId;
  const atual = await buscarNegocio(negocioId);
  if (!atual) return { ok: false, erro: "negócio não encontrado", antes: null, depois: null };

  const agenteAntes = (antes.negocio.agenteId as string | null) ?? null;
  const leadDonoAntes = antes.leadDonoAntes ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: atual.leadId },
      data: { [antes.campoDono!]: leadDonoAntes },
    });
    await tx.negocio.update({
      where: { id: negocioId },
      data: { agenteId: agenteAntes },
    });
    await espelharDonoNasConversas(
      tx,
      atual.leadId,
      antes.finalidade!,
      agenteAntes,
    );
    await logNegocio(tx, {
      negocioId,
      leadId: atual.leadId,
      agenteId: admin.id,
      tipoHistorico: "ATRIBUICAO",
      tipoAtividade: "TRANSFERENCIA",
      descricao: "Transferência revertida (supervisor)",
    });
  });

  emitirNegocioAtualizado(negocioId, atual.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes: registro.antesJson as Record<string, unknown>, depois };
}

export const reatribuirVendedor: FerramentaEscrita = {
  nome: "reatribuir_vendedor",
  titulo: "Reatribuir vendedor",
  descricao:
    "Transfere o negócio e o cliente (naquela finalidade) para outro vendedor, espelhando nas conversas. O destino precisa ter acesso à finalidade.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio a transferir" },
      agenteId: {
        type: "string",
        description: "id do vendedor de destino (com acesso à finalidade)",
      },
    },
    required: ["negocioId", "agenteId"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

// mover_etapa — move um negócio entre etapas ABERTAS do mesmo funil. Fechar
// (ganho/perda) tem ferramentas dedicadas (carregam valor/motivo obrigatórios);
// aqui só movimentação de pipeline + reabertura se o negócio estava fechado,
// espelhando o ramo "Etapa ABERTA" do PATCH /api/negocios/[id].
import { prisma } from "../../prisma";
import { TipoEtapa } from "../../../generated/prisma/enums";
import type { Finalidade } from "../../../generated/prisma/enums";
import { resolverAlertasNegocio } from "../../slaAlertas";
import {
  buscarNegocio,
  emitirNegocioAtualizado,
  logNegocio,
  snapshot,
  StatusNeg,
} from "./comum";
import {
  lerId,
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

async function etapaDestino(etapaId: string) {
  return prisma.etapa.findUnique({
    where: { id: etapaId },
    select: { id: true, nome: true, tipo: true, finalidade: true },
  });
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  const etapaId = lerId(args, "etapaId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  if (!etapaId) return { ok: false, erro: "etapaId é obrigatório" };

  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };

  const destino = await etapaDestino(etapaId);
  if (!destino) return { ok: false, erro: "etapa destino inválida" };
  if (
    destino.finalidade !== "AMBAS" &&
    (destino.finalidade as unknown as Finalidade) !== negocio.finalidade
  ) {
    return { ok: false, erro: "etapa de outro funil" };
  }
  if (destino.tipo !== TipoEtapa.ABERTA) {
    return {
      ok: false,
      erro:
        "mover_etapa só move entre etapas abertas; use registrar_ganho ou registrar_perda para fechar",
    };
  }
  if (negocio.etapaId === destino.id && negocio.status === StatusNeg.ABERTO) {
    return { ok: false, erro: "o negócio já está nessa etapa" };
  }
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const negocioId = lerId(args, "negocioId");
  const etapaId = lerId(args, "etapaId");
  const destino = etapaId ? await etapaDestino(etapaId) : null;
  const negocio = negocioId ? await buscarNegocio(negocioId) : null;
  const origem =
    negocio?.etapaId != null
      ? await prisma.etapa.findUnique({
          where: { id: negocio.etapaId },
          select: { nome: true },
        })
      : null;
  const de = origem?.nome ?? "(sem etapa)";
  const para = destino?.nome ?? "(etapa)";
  const reabre =
    negocio && negocio.status !== StatusNeg.ABERTO
      ? " (reabre o negócio)"
      : "";
  return `Mover negócio de "${de}" para "${para}"${reabre}.`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const etapaId = lerId(args, "etapaId")!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };
  const destino = await etapaDestino(etapaId);
  if (!destino) return { ok: false, erro: "etapa sumiu", antes: null, depois: null };

  const antes = snapshot(negocio);
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: {
        etapaId: destino.id,
        entrouEtapaEm: agora,
        // Reabre se estava fechado (ramo "Etapa ABERTA" do PATCH manual).
        status: StatusNeg.ABERTO,
        fechadoEm: null,
        arquivado: false,
        arquivadoEm: null,
      },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: negocio.leadId,
      agenteId: admin.id,
      tipoHistorico: "ETAPA",
      tipoAtividade: "ETAPA",
      descricao: `Movido para "${destino.nome}" (supervisor)`,
    });
  });

  await resolverAlertasNegocio(negocioId);
  emitirNegocioAtualizado(negocioId, destino.id);

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
        etapaId: (antes.etapaId as string | null) ?? null,
        entrouEtapaEm: antes.entrouEtapaEm
          ? new Date(antes.entrouEtapaEm as string)
          : new Date(),
        status: antes.status as (typeof StatusNeg)[keyof typeof StatusNeg],
        fechadoEm: antes.fechadoEm ? new Date(antes.fechadoEm as string) : null,
        arquivado: Boolean(antes.arquivado),
        arquivadoEm: antes.arquivadoEm
          ? new Date(antes.arquivadoEm as string)
          : null,
      },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: atual.leadId,
      agenteId: admin.id,
      tipoHistorico: "ETAPA",
      tipoAtividade: "ETAPA",
      descricao: "Movimentação revertida (supervisor)",
    });
  });

  await resolverAlertasNegocio(negocioId);
  emitirNegocioAtualizado(negocioId, (antes.etapaId as string | null) ?? null);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes: registro.antesJson as Record<string, unknown>, depois };
}

export const moverEtapa: FerramentaEscrita = {
  nome: "mover_etapa",
  titulo: "Mover de etapa",
  descricao:
    "Move um negócio para outra etapa ABERTA do mesmo funil (não fecha ganho/perda). Reabre o negócio se ele estava fechado.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio a mover" },
      etapaId: {
        type: "string",
        description: "id da etapa ABERTA de destino (mesmo funil do negócio)",
      },
    },
    required: ["negocioId", "etapaId"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

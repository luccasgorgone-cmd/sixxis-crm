// registrar_perda — fecha um negócio como PERDIDO. Replica o ramo PERDIDO do
// PATCH /api/negocios/[id]: grava motivo/obs, a MEMÓRIA da perda (jaFoiPerdido +
// ultimo*) que sobrevive a reaberturas, e conta a transição em vezesPerdido.
import { TipoEtapa } from "../../../generated/prisma/enums";
import {
  ehCodigoMotivo,
  rotuloMotivo,
  motivoEhDesqualificacao,
  MOTIVOS_PERDA,
} from "../../motivosPerda";
import { resolverAlertasNegocio } from "../../slaAlertas";
import { prisma } from "../../prisma";
import {
  buscarNegocio,
  emitirNegocioAtualizado,
  logNegocio,
  snapshot,
  StatusNeg,
} from "./comum";
import {
  lerId,
  lerTexto,
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

async function etapaPerdido(finalidade: string) {
  return prisma.etapa.findFirst({
    where: {
      tipo: TipoEtapa.PERDIDO,
      ativo: true,
      finalidade: { in: [finalidade as never, "AMBAS" as never] },
    },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}

function resolverMotivo(
  args: Args,
  negocioMotivo: string | null,
): { motivo: string; obs: string | null } {
  const motivo = lerTexto(args, "motivo") || negocioMotivo || "";
  const obs = lerTexto(args, "observacao");
  return { motivo, obs };
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };
  if (negocio.status === StatusNeg.PERDIDO) {
    return { ok: false, erro: "o negócio já está marcado como perdido" };
  }
  const etapa = await etapaPerdido(negocio.finalidade);
  if (!etapa) return { ok: false, erro: "funil sem etapa de perdido configurada" };

  const { motivo, obs } = resolverMotivo(args, negocio.motivoPerda);
  if (!motivo) return { ok: false, erro: "motivo é obrigatório para marcar perda" };
  if (!ehCodigoMotivo(motivo)) {
    return { ok: false, erro: `motivo "${motivo}" não é um código válido` };
  }
  void obs;
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const negocioId = lerId(args, "negocioId");
  const negocio = negocioId ? await buscarNegocio(negocioId) : null;
  const { motivo, obs } = resolverMotivo(args, negocio?.motivoPerda ?? null);
  const rotulo = rotuloMotivo(motivo);
  return `Fechar como PERDIDO: ${rotulo}${obs ? ` — ${obs}` : ""}.`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };
  const etapa = await etapaPerdido(negocio.finalidade);
  if (!etapa) return { ok: false, erro: "funil sem etapa de perdido", antes: null, depois: null };
  const { motivo, obs } = resolverMotivo(args, negocio.motivoPerda);

  const antes = snapshot(negocio);
  const agora = new Date();
  const transicao = negocio.status !== StatusNeg.PERDIDO;

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: {
        etapaId: etapa.id,
        entrouEtapaEm: agora,
        motivoPerda: motivo,
        motivoPerdaObs: obs,
        desqualificado: motivoEhDesqualificacao(motivo),
        status: StatusNeg.PERDIDO,
        fechadoEm: agora,
        jaFoiPerdido: true,
        ultimoMotivoPerda: motivo,
        ultimoMotivoPerdaObs: obs,
        ultimaPerdaEm: agora,
        ...(transicao ? { vezesPerdido: { increment: 1 } } : {}),
      },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: negocio.leadId,
      agenteId: admin.id,
      tipoHistorico: "PERDA",
      tipoAtividade: "PERDA",
      descricao: obs
        ? `Negócio perdido: ${rotuloMotivo(motivo)} — ${obs} (supervisor)`
        : `Negócio perdido: ${rotuloMotivo(motivo)} (supervisor)`,
    });
  });

  await resolverAlertasNegocio(negocioId);
  emitirNegocioAtualizado(negocioId, etapa.id);
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
        motivoPerda: (antes.motivoPerda as string | null) ?? null,
        motivoPerdaObs: (antes.motivoPerdaObs as string | null) ?? null,
        desqualificado: Boolean(antes.desqualificado),
        status: antes.status as (typeof StatusNeg)[keyof typeof StatusNeg],
        fechadoEm: antes.fechadoEm ? new Date(antes.fechadoEm as string) : null,
        jaFoiPerdido: Boolean(antes.jaFoiPerdido),
        ultimoMotivoPerda: (antes.ultimoMotivoPerda as string | null) ?? null,
        ultimoMotivoPerdaObs: (antes.ultimoMotivoPerdaObs as string | null) ?? null,
        ultimaPerdaEm: antes.ultimaPerdaEm
          ? new Date(antes.ultimaPerdaEm as string)
          : null,
        vezesPerdido: Number(antes.vezesPerdido ?? 0),
      },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: atual.leadId,
      agenteId: admin.id,
      tipoHistorico: "PERDA",
      tipoAtividade: "PERDA",
      descricao: "Perda revertida (supervisor)",
    });
  });

  await resolverAlertasNegocio(negocioId);
  emitirNegocioAtualizado(negocioId, (antes.etapaId as string | null) ?? null);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes: registro.antesJson as Record<string, unknown>, depois };
}

export const registrarPerda: FerramentaEscrita = {
  nome: "registrar_perda",
  titulo: "Registrar perda",
  descricao:
    "Fecha o negócio como PERDIDO com um motivo (código da lista fechada do Manual, seção 7). Motivos de tipo DESQUALIFICADO não contam contra a conversão.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio a fechar" },
      motivo: {
        type: "string",
        // Fonte única: a lista fechada do Manual (lib/motivosPerda). Evita
        // duplicar os códigos aqui e ficar fora de sincronia.
        enum: MOTIVOS_PERDA.map((m) => m.code),
        description: "código do motivo da perda (lista do Manual, seção 7)",
      },
      observacao: {
        type: "string",
        description: "observação livre (opcional)",
      },
    },
    required: ["negocioId", "motivo"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

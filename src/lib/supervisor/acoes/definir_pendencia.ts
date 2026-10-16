// definir_pendencia — marca ou remove a pendência de um negócio. Espelha o ramo
// de pendência do PATCH /api/negocios/[id]: grava pendente/motivoPendencia/
// motivoPendenciaCode e registra SÓ Atividade(PENDENCIA) (não há
// TipoHistorico.PENDENCIA). Marcar exige um code conhecido OU observação; code
// "OUTRO" exige observação. O reverter restaura os três campos.
import { AtividadeTipo } from "../../../generated/prisma/enums";
import { prisma } from "../../prisma";
import { ehCodigoPendencia, rotuloPendencia } from "../../motivosPendencia";
import {
  buscarNegocio,
  emitirNegocioAtualizado,
  snapshot,
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

function lerPendente(args: Args): boolean | null {
  return typeof args.pendente === "boolean" ? args.pendente : null;
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  const pendente = lerPendente(args);
  if (pendente == null) return { ok: false, erro: "informe pendente (true para marcar, false para remover)" };
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };

  if (pendente) {
    const code = lerTexto(args, "motivoPendenciaCode");
    const obs = lerTexto(args, "motivoPendencia");
    if (!code && !obs) return { ok: false, erro: "escolha o motivo da pendência (motivoPendenciaCode) ou descreva em motivoPendencia" };
    if (code && !ehCodigoPendencia(code)) return { ok: false, erro: "motivo de pendência inválido" };
    if (code === "OUTRO" && !obs) return { ok: false, erro: "descreva o motivo em motivoPendencia (code OUTRO)" };
  }
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const pendente = lerPendente(args);
  if (!pendente) return "Remover a pendência do negócio.";
  const code = lerTexto(args, "motivoPendenciaCode");
  const obs = lerTexto(args, "motivoPendencia");
  const rotulo = code ? rotuloPendencia(code) : (obs ?? "");
  return `Marcar como pendente: ${rotulo}${obs && code ? ` — ${obs}` : ""}.`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const pendente = lerPendente(args)!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };

  const antes = snapshot(negocio);

  let data: {
    pendente: boolean;
    motivoPendencia: string | null;
    motivoPendenciaCode: string | null;
  };
  let descricao: string;
  if (pendente) {
    const code = lerTexto(args, "motivoPendenciaCode");
    const obs = lerTexto(args, "motivoPendencia");
    const rotulo = code ? rotuloPendencia(code) : (obs ?? "");
    data = { pendente: true, motivoPendenciaCode: code, motivoPendencia: obs };
    descricao = `Negócio marcado como pendente: ${rotulo}${obs && code ? ` — ${obs}` : ""} (supervisor)`;
  } else {
    data = { pendente: false, motivoPendencia: null, motivoPendenciaCode: null };
    descricao = "Pendência removida (supervisor)";
  }

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({ where: { id: negocioId }, data });
    await tx.atividade.create({
      data: {
        leadId: negocio.leadId,
        negocioId,
        agenteId: admin.id,
        tipo: AtividadeTipo.PENDENCIA,
        descricao,
      },
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
        pendente: Boolean(antes.pendente),
        motivoPendencia: (antes.motivoPendencia as string | null) ?? null,
        motivoPendenciaCode: (antes.motivoPendenciaCode as string | null) ?? null,
      },
    });
    await tx.atividade.create({
      data: {
        leadId: atual.leadId,
        negocioId,
        agenteId: admin.id,
        tipo: AtividadeTipo.PENDENCIA,
        descricao: "Pendência revertida (supervisor)",
      },
    });
  });

  emitirNegocioAtualizado(negocioId, atual.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes: registro.antesJson as Record<string, unknown>, depois };
}

export const definirPendencia: FerramentaEscrita = {
  nome: "definir_pendencia",
  titulo: "Pendência",
  descricao:
    "Marca (pendente=true) ou remove (pendente=false) a pendência de um negócio. Ao marcar, informe motivoPendenciaCode (um de: AGUARDANDO_CLIENTE, AGUARDANDO_PAGAMENTO, AGUARDANDO_ESTOQUE, NEGOCIANDO, AGENDADO, ANALISE_INTERNA, AGUARDANDO_NF, AGUARDANDO_TECNICO, OUTRO) e/ou motivoPendencia (observação; obrigatória se code=OUTRO).",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio" },
      pendente: { type: "boolean", description: "true marca pendência, false remove" },
      motivoPendenciaCode: {
        type: "string",
        enum: [
          "AGUARDANDO_CLIENTE",
          "AGUARDANDO_PAGAMENTO",
          "AGUARDANDO_ESTOQUE",
          "NEGOCIANDO",
          "AGENDADO",
          "ANALISE_INTERNA",
          "AGUARDANDO_NF",
          "AGUARDANDO_TECNICO",
          "OUTRO",
        ],
        description: "código do motivo (só ao marcar)",
      },
      motivoPendencia: {
        type: "string",
        description: "observação livre (obrigatória se code=OUTRO)",
      },
    },
    required: ["negocioId", "pendente"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

// gerenciar_etiqueta — adiciona ou remove uma etiqueta do CLIENTE (Lead) via a
// join LeadEtiqueta, resolvendo o leadId pelo negócio. Espelha
// POST/DELETE /api/negocios/[id]/etiquetas: idempotente (não duplica link, não
// falha ao remover inexistente) e loga HistoricoNegocio(ETIQUETA) +
// Atividade(ETIQUETA). O reverter desfaz exatamente o que ESTA ação fez (só
// remove o link se ela o criou; só recria se ela o removeu) — por isso o
// depoisJson guarda criou/removeu.
import { prisma } from "../../prisma";
import {
  buscarNegocio,
  emitirNegocioAtualizado,
  logNegocio,
} from "./comum";
import {
  moverParaVipSeVenda,
  sairDaVipSeNaColuna,
  NOME_ETIQUETA_VIP,
} from "../../aprazo/ops";
import {
  lerId,
  lerTexto,
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

type AcaoEtiqueta = "adicionar" | "remover";

function lerAcao(args: Args): AcaoEtiqueta | null {
  const a = (lerTexto(args, "acao") ?? "").toLowerCase();
  return a === "adicionar" || a === "remover" ? a : null;
}

function buscarEtiqueta(id: string) {
  return prisma.etiqueta.findUnique({ where: { id }, select: { id: true, nome: true } });
}

function buscarLink(leadId: string, etiquetaId: string) {
  return prisma.leadEtiqueta.findUnique({
    where: { leadId_etiquetaId: { leadId, etiquetaId } },
    select: { leadId: true, etiquetaId: true },
  });
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  const etiquetaId = lerId(args, "etiquetaId");
  const acao = lerAcao(args);
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  if (!etiquetaId) return { ok: false, erro: "etiquetaId é obrigatório" };
  if (!acao) return { ok: false, erro: "acao deve ser 'adicionar' ou 'remover'" };
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };
  const etiqueta = await buscarEtiqueta(etiquetaId);
  if (!etiqueta) return { ok: false, erro: "etiqueta não encontrada" };
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const etiquetaId = lerId(args, "etiquetaId");
  const acao = lerAcao(args);
  const etiqueta = etiquetaId ? await buscarEtiqueta(etiquetaId) : null;
  const nome = etiqueta?.nome ?? "(etiqueta)";
  return acao === "remover"
    ? `Remover a etiqueta "${nome}" do cliente.`
    : `Adicionar a etiqueta "${nome}" ao cliente.`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const etiquetaId = lerId(args, "etiquetaId")!;
  const acao = lerAcao(args)!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };
  const etiqueta = await buscarEtiqueta(etiquetaId);
  if (!etiqueta) return { ok: false, erro: "etiqueta sumiu", antes: null, depois: null };

  const leadId = negocio.leadId;
  const linkExistia = (await buscarLink(leadId, etiquetaId)) != null;

  if (acao === "adicionar") {
    if (linkExistia) {
      // Idempotente: já tem a etiqueta, nada a fazer (nem log).
      return {
        ok: true,
        antes: { linkExistiaAntes: true },
        depois: { leadId, etiquetaId, acao, criou: false },
        negocioId,
        leadId,
      };
    }
    await prisma.$transaction(async (tx) => {
      await tx.leadEtiqueta.create({ data: { leadId, etiquetaId } });
      await logNegocio(tx, {
        negocioId,
        leadId,
        agenteId: admin.id,
        tipoHistorico: "ETIQUETA",
        tipoAtividade: "ETIQUETA",
        descricao: `Etiqueta "${etiqueta.nome}" adicionada (supervisor)`,
      });
    });
    emitirNegocioAtualizado(negocioId, negocio.etapaId);
    // VIP: adicionar a etiqueta VIP move o card para a coluna VIP (igual a API).
    if (etiqueta.nome.trim().toUpperCase() === NOME_ETIQUETA_VIP) {
      await moverParaVipSeVenda(negocioId);
    }
    return {
      ok: true,
      antes: { linkExistiaAntes: false },
      depois: { leadId, etiquetaId, acao, criou: true },
      negocioId,
      leadId,
    };
  }

  // remover
  if (!linkExistia) {
    return {
      ok: true,
      antes: { linkExistiaAntes: false },
      depois: { leadId, etiquetaId, acao, removeu: false },
      negocioId,
      leadId,
    };
  }
  await prisma.$transaction(async (tx) => {
    await tx.leadEtiqueta.delete({
      where: { leadId_etiquetaId: { leadId, etiquetaId } },
    });
    await logNegocio(tx, {
      negocioId,
      leadId,
      agenteId: admin.id,
      tipoHistorico: "ETIQUETA",
      tipoAtividade: "ETIQUETA",
      descricao: `Etiqueta "${etiqueta.nome}" removida (supervisor)`,
    });
  });
  emitirNegocioAtualizado(negocioId, negocio.etapaId);
  // VIP: remover a etiqueta VIP devolve o card da coluna VIP para Em atendimento.
  if (etiqueta.nome.trim().toUpperCase() === NOME_ETIQUETA_VIP) {
    await sairDaVipSeNaColuna(negocioId);
  }
  return {
    ok: true,
    antes: { linkExistiaAntes: true },
    depois: { leadId, etiquetaId, acao, removeu: true },
    negocioId,
    leadId,
  };
}

async function reverter(
  registro: RegistroAcao,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const depois = registro.depoisJson as
    | { leadId?: string; etiquetaId?: string; acao?: AcaoEtiqueta; criou?: boolean; removeu?: boolean }
    | null;
  if (!depois?.leadId || !depois.etiquetaId || !depois.acao || !registro.negocioId) {
    return { ok: false, erro: "sem registro para reverter", antes: null, depois: null };
  }
  const negocioId = registro.negocioId;
  const { leadId, etiquetaId, acao } = depois;
  const etiqueta = await buscarEtiqueta(etiquetaId);
  const nome = etiqueta?.nome ?? "(etiqueta)";

  // Só desfaz se ESTA ação efetivamente mexeu no link (não em no-op idempotente).
  if (acao === "adicionar" && depois.criou) {
    const link = await buscarLink(leadId, etiquetaId);
    if (link) {
      await prisma.$transaction(async (tx) => {
        await tx.leadEtiqueta.delete({ where: { leadId_etiquetaId: { leadId, etiquetaId } } });
        await logNegocio(tx, {
          negocioId,
          leadId,
          agenteId: admin.id,
          tipoHistorico: "ETIQUETA",
          tipoAtividade: "ETIQUETA",
          descricao: `Etiqueta "${nome}" removida (revertido, supervisor)`,
        });
      });
    }
  } else if (acao === "remover" && depois.removeu) {
    const link = await buscarLink(leadId, etiquetaId);
    if (!link) {
      await prisma.$transaction(async (tx) => {
        await tx.leadEtiqueta.create({ data: { leadId, etiquetaId } });
        await logNegocio(tx, {
          negocioId,
          leadId,
          agenteId: admin.id,
          tipoHistorico: "ETIQUETA",
          tipoAtividade: "ETIQUETA",
          descricao: `Etiqueta "${nome}" adicionada (revertido, supervisor)`,
        });
      });
    }
  } else {
    // No-op idempotente: nada a reverter.
    return { ok: true, antes: null, depois: null, negocioId, leadId };
  }

  const atual = await buscarNegocio(negocioId);
  emitirNegocioAtualizado(negocioId, atual?.etapaId ?? null);
  return { ok: true, antes: null, depois: { leadId, etiquetaId, acao, revertido: true }, negocioId, leadId };
}

export const gerenciarEtiqueta: FerramentaEscrita = {
  nome: "gerenciar_etiqueta",
  titulo: "Etiqueta",
  descricao:
    "Adiciona ou remove uma etiqueta do cliente (lead) do negócio. Use listar/consulta para obter o etiquetaId real. acao = 'adicionar' ou 'remover'. Idempotente.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio (resolve o cliente)" },
      etiquetaId: { type: "string", description: "id da etiqueta" },
      acao: {
        type: "string",
        enum: ["adicionar", "remover"],
        description: "adicionar ou remover a etiqueta",
      },
    },
    required: ["negocioId", "etiquetaId", "acao"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

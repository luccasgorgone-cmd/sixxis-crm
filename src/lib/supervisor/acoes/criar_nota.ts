// criar_nota — adiciona uma nota ao cliente/negócio. Replica o POST
// /api/negocios/[id]/notas: Nota (timeline do cliente) + HistoricoNegocio(NOTA)
// + Atividade(NOTA). É uma ferramenta de CRIAÇÃO: o reverter apaga a Nota criada
// (cujo id vai em depoisJson), os logs ficam como rastro.
import { prisma } from "../../prisma";
import { buscarNegocio, logNegocio } from "./comum";
import {
  lerId,
  lerTexto,
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

function resumir(texto: string): string {
  return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  const texto = lerTexto(args, "texto");
  if (!texto) return { ok: false, erro: "texto da nota é obrigatório" };
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const texto = lerTexto(args, "texto") ?? "";
  return `Adicionar nota: "${resumir(texto)}".`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const texto = lerTexto(args, "texto")!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };
  const resumo = resumir(texto);

  let notaId = "";
  await prisma.$transaction(async (tx) => {
    const nota = await tx.nota.create({
      data: { leadId: negocio.leadId, agenteId: admin.id, texto },
    });
    notaId = nota.id;
    await logNegocio(tx, {
      negocioId,
      leadId: negocio.leadId,
      agenteId: admin.id,
      tipoHistorico: "NOTA",
      tipoAtividade: "NOTA",
      descricao: resumo,
    });
  });

  return {
    ok: true,
    antes: null,
    depois: { notaId },
    negocioId,
    leadId: negocio.leadId,
  };
}

async function reverter(
  registro: RegistroAcao,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const depois = registro.depoisJson as { notaId?: string } | null;
  const notaId = depois?.notaId;
  if (!notaId) {
    return { ok: false, erro: "sem id da nota para reverter", antes: null, depois: null };
  }
  const existente = await prisma.nota.findUnique({
    where: { id: notaId },
    select: { id: true, leadId: true },
  });
  if (!existente) {
    // Já não existe: reverter é idempotente, nada a fazer.
    return { ok: true, antes: null, depois: null };
  }
  await prisma.$transaction(async (tx) => {
    await tx.nota.delete({ where: { id: notaId } });
    if (registro.negocioId) {
      await logNegocio(tx, {
        negocioId: registro.negocioId,
        leadId: existente.leadId,
        agenteId: admin.id,
        tipoHistorico: "NOTA",
        tipoAtividade: "NOTA",
        descricao: "Nota removida (supervisor)",
      });
    }
  });
  return { ok: true, antes: null, depois: { notaId: null } };
}

export const criarNota: FerramentaEscrita = {
  nome: "criar_nota",
  titulo: "Adicionar nota",
  descricao:
    "Registra uma nota no negócio/cliente (timeline). Não envia nada ao cliente — é anotação interna.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio" },
      texto: { type: "string", description: "conteúdo da nota interna" },
    },
    required: ["negocioId", "texto"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

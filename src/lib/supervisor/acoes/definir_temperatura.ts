// definir_temperatura — muda a temperatura (interesse) de um negócio:
// QUENTE / MORNO / FRIO. Espelha o ramo de temperatura do PATCH
// /api/negocios/[id], que grava SÓ o campo (sem HistoricoNegocio/Atividade — a
// própria SupervisorAcao é a auditoria). O reverter restaura a temperatura
// anterior (capturada no snapshot).
import { Temperatura } from "../../../generated/prisma/enums";
import { prisma } from "../../prisma";
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

const VALIDAS: readonly string[] = ["QUENTE", "MORNO", "FRIO"];

function lerTemperatura(args: Args): Temperatura | null {
  const t = (lerTexto(args, "temperatura") ?? "").toUpperCase();
  return VALIDAS.includes(t) ? (t as Temperatura) : null;
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  const temp = lerTemperatura(args);
  if (!temp) return { ok: false, erro: "temperatura deve ser QUENTE, MORNO ou FRIO" };
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };
  if (negocio.temperatura === temp) {
    return { ok: false, erro: `o negócio já está ${temp}` };
  }
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const negocioId = lerId(args, "negocioId");
  const temp = lerTemperatura(args);
  const negocio = negocioId ? await buscarNegocio(negocioId) : null;
  const de = negocio?.temperatura ?? "(atual)";
  return `Mudar temperatura de ${de} para ${temp ?? "(nova)"}.`;
}

async function executar(args: Args): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const temp = lerTemperatura(args)!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };

  const antes = snapshot(negocio);
  await prisma.negocio.update({
    where: { id: negocioId },
    data: { temperatura: temp },
  });

  emitirNegocioAtualizado(negocioId, negocio.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes, depois, negocioId, leadId: negocio.leadId };
}

async function reverter(registro: RegistroAcao): Promise<ResultadoExec> {
  const antes = registro.antesJson as ReturnType<typeof snapshot> | null;
  if (!antes || !registro.negocioId) {
    return { ok: false, erro: "sem snapshot para reverter", antes: null, depois: null };
  }
  const negocioId = registro.negocioId;
  const atual = await buscarNegocio(negocioId);
  if (!atual) return { ok: false, erro: "negócio não encontrado", antes: null, depois: null };

  await prisma.negocio.update({
    where: { id: negocioId },
    data: { temperatura: (antes.temperatura as Temperatura) ?? Temperatura.MORNO },
  });

  emitirNegocioAtualizado(negocioId, atual.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes: registro.antesJson as Record<string, unknown>, depois };
}

export const definirTemperatura: FerramentaEscrita = {
  nome: "definir_temperatura",
  titulo: "Definir temperatura",
  descricao:
    "Define a temperatura (interesse) de um negócio: QUENTE, MORNO ou FRIO. A temperatura entra ponderada no cálculo de cobertura.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio" },
      temperatura: {
        type: "string",
        enum: ["QUENTE", "MORNO", "FRIO"],
        description: "nova temperatura",
      },
    },
    required: ["negocioId", "temperatura"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

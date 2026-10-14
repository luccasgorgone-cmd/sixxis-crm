// criar_lembrete — agenda um contato futuro para o vendedor responsável pelo
// negócio. Replica o POST /api/lembretes: cria Lembrete (agenda do agente) +
// Atividade(LEMBRETE) + emite "lembrete:novo". O dono do lembrete é o agente do
// negócio (cai na agenda DELE); sem agente, fica com o admin que confirmou.
// Ferramenta de CRIAÇÃO: o reverter apaga o Lembrete (id em depoisJson).
import { prisma } from "../../prisma";
import { getIO } from "../../socket";
import { AtividadeTipo } from "../../../generated/prisma/enums";
import { buscarNegocio } from "./comum";
import {
  lerId,
  lerNumero,
  lerTexto,
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

function parseData(args: Args): Date | null {
  const bruto = lerTexto(args, "dataHora");
  if (!bruto) return null;
  const d = new Date(bruto);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Resolve QUANDO agendar. Prioriza `dataHoraRelativaMin` (minutos a partir de
// AGORA) — usado pela varredura, porque é recomputado na confirmação e nunca
// "vence" (um dataHora absoluto gravado na proposta viraria passado se o gestor
// demorasse a confirmar, travando a ação). Senão usa `dataHora` (ISO absoluto),
// como no uso pelo chat.
function resolverQuando(args: Args): Date | null {
  const rel = lerNumero(args, "dataHoraRelativaMin");
  if (rel != null && rel > 0) {
    return new Date(Date.now() + Math.round(rel) * 60_000);
  }
  return parseData(args);
}

function formatar(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  const data = resolverQuando(args);
  if (!data) {
    return { ok: false, erro: "informe dataHora (ISO 8601) ou dataHoraRelativaMin (minutos)" };
  }
  if (data.getTime() <= Date.now()) {
    return { ok: false, erro: "dataHora precisa ser no futuro" };
  }
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const data = resolverQuando(args);
  const nota = lerTexto(args, "nota");
  const quando = data ? formatar(data) : "(data)";
  return `Agendar contato para ${quando}${nota ? ` — ${nota}` : ""}.`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const data = resolverQuando(args)!;
  const nota = lerTexto(args, "nota");
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };

  // Dono do lembrete: o agente do negócio (cai na agenda dele). Fallback: admin.
  const donoLembrete = negocio.agenteId ?? admin.id;

  let lembreteId = "";
  await prisma.$transaction(async (tx) => {
    const lembrete = await tx.lembrete.create({
      data: {
        leadId: negocio.leadId,
        negocioId,
        agenteId: donoLembrete,
        finalidade: negocio.finalidade,
        dataHora: data,
        nota,
      },
    });
    lembreteId = lembrete.id;
    await tx.atividade.create({
      data: {
        leadId: negocio.leadId,
        negocioId,
        agenteId: admin.id,
        tipo: AtividadeTipo.LEMBRETE,
        descricao: `Contato agendado para ${formatar(data)}${
          nota ? ` — ${nota}` : ""
        } (supervisor)`,
      },
    });
  });

  getIO()?.emit("lembrete:novo", { agenteId: donoLembrete, leadId: negocio.leadId });

  return {
    ok: true,
    antes: null,
    depois: { lembreteId },
    negocioId,
    leadId: negocio.leadId,
  };
}

async function reverter(
  registro: RegistroAcao,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const depois = registro.depoisJson as { lembreteId?: string } | null;
  const lembreteId = depois?.lembreteId;
  if (!lembreteId) {
    return { ok: false, erro: "sem id do lembrete para reverter", antes: null, depois: null };
  }
  const existente = await prisma.lembrete.findUnique({
    where: { id: lembreteId },
    select: { id: true, leadId: true, negocioId: true, agenteId: true },
  });
  if (!existente) {
    return { ok: true, antes: null, depois: null };
  }
  await prisma.$transaction(async (tx) => {
    await tx.lembrete.delete({ where: { id: lembreteId } });
    await tx.atividade.create({
      data: {
        leadId: existente.leadId,
        negocioId: existente.negocioId,
        agenteId: admin.id,
        tipo: AtividadeTipo.LEMBRETE,
        descricao: "Lembrete cancelado (supervisor)",
      },
    });
  });
  getIO()?.emit("lembrete:novo", {
    agenteId: existente.agenteId,
    leadId: existente.leadId,
  });
  return { ok: true, antes: null, depois: { lembreteId: null } };
}

export const criarLembrete: FerramentaEscrita = {
  nome: "criar_lembrete",
  titulo: "Agendar contato",
  descricao:
    "Agenda um lembrete de contato na agenda do vendedor responsável pelo negócio. Não envia nada ao cliente.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio" },
      dataHora: {
        type: "string",
        description: "data/hora do contato em ISO 8601 (futuro). Use isto OU dataHoraRelativaMin.",
      },
      dataHoraRelativaMin: {
        type: "number",
        description: "alternativa a dataHora: minutos a partir de agora (recomputado na confirmação)",
      },
      nota: {
        type: "string",
        description: "observação opcional do lembrete",
      },
    },
    required: ["negocioId"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};

// Admin: configuracao do Agente IA (singleton). Apenas persiste (sem inferencia
// nesta fase). GET/PUT, somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { normalizarHorarios } from "@/lib/horario";
import { HORARIOS_PADRAO } from "@/lib/seed";
import { TEMPLATE_BASE_CONHECIMENTO } from "@/lib/lunaCatalogo";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELOS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"];

async function pegar() {
  const existente = await prisma.configAgenteIA.findFirst();
  if (existente) return existente;
  return prisma.configAgenteIA.create({ data: {} });
}

// Serializa a config para a UI, com horarios sempre normalizados (default quando
// nulo) para o editor de faixas.
function paraUI(c: Awaited<ReturnType<typeof pegar>>) {
  return {
    ...c,
    horarios: normalizarHorarios(c.horarios) ?? HORARIOS_PADRAO,
    // Template inicial para o admin popular a base de conhecimento (nao grava
    // sozinho: o dono clica para inserir e depois preenche com dados reais).
    templateBaseConhecimento: TEMPLATE_BASE_CONHECIMENTO,
  };
}

// Inteiro >= 0 a partir de um valor desconhecido; null para vazio/invalido.
function inteiroOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const c = await pegar();
  return NextResponse.json({ config: paraUI(c) });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  try {
    // Whitelist dos campos aceitos.
    const data: Prisma.ConfigAgenteIAUpdateManyMutationInput = {};

    const booleanos: (keyof Prisma.ConfigAgenteIAUpdateManyMutationInput)[] = [
      "ativo",
      "responderForaHorario",
      "responderLeadNovo",
      "opera24h",
      "usarHorarioComercial",
      "handoffSeClientePedir",
      "handoffSeLeadQuente",
      "cupomAtivo",
    ];
    for (const k of booleanos) {
      if (body[k] !== undefined) {
        (data as Record<string, unknown>)[k] = Boolean(body[k]);
      }
    }

    const textos: (keyof Prisma.ConfigAgenteIAUpdateManyMutationInput)[] = [
      "promptSistema",
      "baseConhecimento",
      "handoffPalavras",
      "saudacaoAutomatica",
      "mensagemHandoff",
      "cupomPrimeiraCompra",
      "cupomDescricao",
    ];
    for (const k of textos) {
      if (body[k] !== undefined) {
        (data as Record<string, unknown>)[k] =
          typeof body[k] === "string" ? (body[k] as string).trim() || null : null;
      }
    }

    if (body.modelo !== undefined && MODELOS.includes(String(body.modelo))) {
      data.modelo = String(body.modelo);
    }
    if (body.segundosAntesDeResponder !== undefined) {
      data.segundosAntesDeResponder = inteiroOuNull(body.segundosAntesDeResponder);
    }
    if (body.maxMensagensAntesHandoff !== undefined) {
      data.maxMensagensAntesHandoff = inteiroOuNull(body.maxMensagensAntesHandoff);
    }
    if (body.horarios !== undefined) {
      const h = normalizarHorarios(body.horarios);
      if (h) data.horarios = h as unknown as Prisma.InputJsonValue;
    }

    // Singleton: atualiza sem depender do id; cria se nao houver linha.
    if (Object.keys(data).length > 0) {
      const res = await prisma.configAgenteIA.updateMany({ data });
      if (res.count === 0) {
        await prisma.configAgenteIA.create({ data: {} });
        await prisma.configAgenteIA.updateMany({ data });
      }
    } else {
      await pegar();
    }

    const config = await pegar();
    return NextResponse.json({ config: paraUI(config) });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao salvar configuracao da IA",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}

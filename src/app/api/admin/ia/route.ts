// Admin: configuracao do Agente IA (singleton). Apenas persiste (sem inferencia
// nesta fase). GET/PUT, somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELOS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"];

async function pegar() {
  const existente = await prisma.configAgenteIA.findFirst();
  if (existente) return existente;
  return prisma.configAgenteIA.create({ data: {} });
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const c = await pegar();
  return NextResponse.json({ config: c });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: {
    ativo?: boolean;
    modelo?: string;
    promptSistema?: string;
    responderForaHorario?: boolean;
    responderLeadNovo?: boolean;
    handoffPalavras?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  try {
    // Whitelist dos campos aceitos.
    const data: Prisma.ConfigAgenteIAUpdateManyMutationInput = {};
    if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);
    if (body.modelo !== undefined && MODELOS.includes(body.modelo)) {
      data.modelo = body.modelo;
    }
    if (body.promptSistema !== undefined) {
      data.promptSistema =
        typeof body.promptSistema === "string"
          ? body.promptSistema.trim() || null
          : null;
    }
    if (body.responderForaHorario !== undefined) {
      data.responderForaHorario = Boolean(body.responderForaHorario);
    }
    if (body.responderLeadNovo !== undefined) {
      data.responderLeadNovo = Boolean(body.responderLeadNovo);
    }
    if (body.handoffPalavras !== undefined) {
      data.handoffPalavras =
        typeof body.handoffPalavras === "string"
          ? body.handoffPalavras.trim() || null
          : null;
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
    return NextResponse.json({ config });
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

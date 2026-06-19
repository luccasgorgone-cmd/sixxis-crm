// Admin: configuracao do Agente IA (singleton). Apenas persiste (sem inferencia
// nesta fase). GET/PUT, somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";

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
  const c = await pegar();
  const atualizada = await prisma.configAgenteIA.update({
    where: { id: c.id },
    data: {
      ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
      ...(body.modelo !== undefined && MODELOS.includes(body.modelo)
        ? { modelo: body.modelo }
        : {}),
      ...(body.promptSistema !== undefined
        ? { promptSistema: body.promptSistema.trim() || null }
        : {}),
      ...(body.responderForaHorario !== undefined
        ? { responderForaHorario: body.responderForaHorario }
        : {}),
      ...(body.responderLeadNovo !== undefined
        ? { responderLeadNovo: body.responderLeadNovo }
        : {}),
      ...(body.handoffPalavras !== undefined
        ? { handoffPalavras: body.handoffPalavras.trim() || null }
        : {}),
    },
  });
  return NextResponse.json({ config: atualizada });
}

// Admin: config do assistente de escrita (singleton). GET/PUT, somente ADMIN.
// Campos: modelo (whitelist) e ativo (liga/desliga a varinha).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELOS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"];

async function pegar() {
  const existente = await prisma.assistenteConfig.findFirst();
  if (existente) return existente;
  return prisma.assistenteConfig.create({ data: {} });
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const config = await pegar();
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { modelo?: unknown; ativo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  try {
    const data: { modelo?: string; ativo?: boolean } = {};
    if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);
    if (body.modelo !== undefined && MODELOS.includes(String(body.modelo))) {
      data.modelo = String(body.modelo);
    }

    // Singleton: atualiza sem depender do id; cria se nao houver linha.
    if (Object.keys(data).length > 0) {
      const res = await prisma.assistenteConfig.updateMany({ data });
      if (res.count === 0) {
        await prisma.assistenteConfig.create({ data: {} });
        await prisma.assistenteConfig.updateMany({ data });
      }
    } else {
      await pegar();
    }

    const config = await pegar();
    return NextResponse.json({ config });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao salvar configuracao do assistente",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}

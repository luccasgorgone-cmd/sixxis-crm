// Admin: configuracao do Oracle (singleton). Modelo + orientacoes extras + base
// de conhecimento + ativo. As TRAVAS de seguranca ficam FIXAS em lib/oracle.ts.
// GET/PUT, SOMENTE ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELOS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"];

async function pegar() {
  const existente = await prisma.configOracle.findFirst();
  if (existente) return existente;
  return prisma.configOracle.create({ data: {} });
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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  try {
    const data: Prisma.ConfigOracleUpdateManyMutationInput = {};

    if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);
    if (body.modelo !== undefined && MODELOS.includes(String(body.modelo))) {
      data.modelo = String(body.modelo);
    }
    const textos: (keyof Prisma.ConfigOracleUpdateManyMutationInput)[] = [
      "promptSistema",
      "baseConhecimento",
    ];
    for (const k of textos) {
      if (body[k] !== undefined) {
        (data as Record<string, unknown>)[k] =
          typeof body[k] === "string" ? (body[k] as string).trim() || null : null;
      }
    }

    // Singleton: atualiza sem depender do id; cria se nao houver linha.
    if (Object.keys(data).length > 0) {
      const res = await prisma.configOracle.updateMany({ data });
      if (res.count === 0) {
        await prisma.configOracle.create({ data: {} });
        await prisma.configOracle.updateMany({ data });
      }
    } else {
      await pegar();
    }

    const config = await pegar();
    return NextResponse.json({ config });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao salvar configuracao do Oracle",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}

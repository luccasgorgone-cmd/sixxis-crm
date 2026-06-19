// Admin: lista e cria observacoes pre-definidas. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const observacoes = await prisma.observacaoPreset.findMany({
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
  });
  return NextResponse.json({ observacoes });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { texto?: string; ordem?: number; ativo?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const texto = String(body?.texto ?? "").trim();
  if (!texto) {
    return NextResponse.json({ erro: "texto obrigatorio" }, { status: 400 });
  }
  const observacao = await prisma.observacaoPreset.create({
    data: {
      texto,
      ordem: typeof body.ordem === "number" ? body.ordem : 0,
      ativo: body.ativo ?? true,
    },
  });
  return NextResponse.json({ observacao });
}

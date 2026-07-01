// Admin: edita (PUT) e exclui (DELETE) um tom do assistente de escrita. ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await params;
  let body: {
    nome?: unknown;
    instrucao?: unknown;
    ordem?: unknown;
    ativo?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: {
    nome?: string;
    instrucao?: string;
    ordem?: number;
    ativo?: boolean;
  } = {};
  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) {
      return NextResponse.json({ erro: "nome vazio" }, { status: 400 });
    }
    data.nome = nome;
  }
  if (body.instrucao !== undefined) {
    const instrucao = String(body.instrucao).trim();
    if (!instrucao) {
      return NextResponse.json({ erro: "instrucao vazia" }, { status: 400 });
    }
    data.instrucao = instrucao;
  }
  if (body.ordem !== undefined && Number.isFinite(Number(body.ordem))) {
    data.ordem = Math.max(0, Math.floor(Number(body.ordem)));
  }
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  try {
    const tom = await prisma.assistenteTom.update({ where: { id }, data });
    return NextResponse.json({ tom });
  } catch {
    return NextResponse.json({ erro: "tom nao encontrado" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await prisma.assistenteTom.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ erro: "tom nao encontrado" }, { status: 404 });
  }
}

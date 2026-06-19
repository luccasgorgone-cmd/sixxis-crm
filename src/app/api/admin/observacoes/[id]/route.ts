// Admin: edita ou remove uma observacao pre-definida.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: { texto?: string; ordem?: number; ativo?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const data: Prisma.ObservacaoPresetUncheckedUpdateInput = {};
  if (body.texto !== undefined) data.texto = body.texto.trim();
  if (body.ordem !== undefined) data.ordem = body.ordem;
  if (body.ativo !== undefined) data.ativo = body.ativo;

  const observacao = await prisma.observacaoPreset.update({
    where: { id },
    data,
  });
  return NextResponse.json({ observacao });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.observacaoPreset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Admin: edita ou remove um numero de WhatsApp.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";
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
  let body: {
    nome?: string;
    instanciaEvolution?: string;
    numero?: string | null;
    finalidade?: string;
    ativo?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const data: Prisma.InstanciaWhatsAppUncheckedUpdateInput = {};
  if (body.nome !== undefined) data.nome = body.nome.trim();
  if (body.instanciaEvolution !== undefined) {
    data.instanciaEvolution = body.instanciaEvolution.trim();
  }
  if (body.numero !== undefined) data.numero = body.numero?.trim() || null;
  if (body.finalidade === Finalidade.VENDA || body.finalidade === Finalidade.POS_VENDA) {
    data.finalidade = body.finalidade;
  }
  if (body.ativo !== undefined) data.ativo = body.ativo;

  try {
    const numero = await prisma.instanciaWhatsApp.update({
      where: { id },
      data,
    });
    return NextResponse.json({ numero });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (erro.code === "P2002") {
        return NextResponse.json(
          { erro: "identificador ja em uso" },
          { status: 409 },
        );
      }
      if (erro.code === "P2025") {
        return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
      }
    }
    throw erro;
  }
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
  // Desvincula conversas e remove a instancia.
  await prisma.$transaction([
    prisma.conversa.updateMany({
      where: { instanciaId: id },
      data: { instanciaId: null },
    }),
    prisma.instanciaWhatsApp.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}

// Admin: edita ou remove uma etiqueta (remocao desvincula dos leads).
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
  let body: { nome?: string; cor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const data: Prisma.EtiquetaUncheckedUpdateInput = {};
  if (body.nome !== undefined) data.nome = body.nome.trim();
  if (body.cor !== undefined) data.cor = body.cor.trim();

  const etiqueta = await prisma.etiqueta.update({ where: { id }, data });
  return NextResponse.json({ etiqueta });
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
  await prisma.$transaction([
    prisma.leadEtiqueta.deleteMany({ where: { etiquetaId: id } }),
    prisma.etiqueta.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}

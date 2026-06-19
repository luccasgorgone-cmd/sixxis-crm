// Admin: edita ou remove uma etapa. Remocao so quando nao ha negocios nela.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { TipoEtapa, FinalidadeEtapa } from "@/generated/prisma/enums";
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
    cor?: string;
    tipo?: string;
    finalidade?: string;
    ativo?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const data: Prisma.EtapaUncheckedUpdateInput = {};
  if (body.nome !== undefined) data.nome = body.nome.trim();
  if (body.cor !== undefined) data.cor = body.cor.trim();
  if (body.tipo !== undefined && body.tipo in TipoEtapa) {
    data.tipo = body.tipo as TipoEtapa;
  }
  if (body.finalidade !== undefined && body.finalidade in FinalidadeEtapa) {
    data.finalidade = body.finalidade as FinalidadeEtapa;
  }
  if (body.ativo !== undefined) data.ativo = body.ativo;

  const etapa = await prisma.etapa.update({ where: { id }, data });
  return NextResponse.json({ etapa });
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

  const usos = await prisma.negocio.count({ where: { etapaId: id } });
  if (usos > 0) {
    return NextResponse.json(
      { erro: "etapa em uso; desative-a em vez de remover" },
      { status: 409 },
    );
  }
  await prisma.etapa.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

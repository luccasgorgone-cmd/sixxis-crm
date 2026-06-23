// Admin: edita (nome/ativo) ou remove uma empresa faturada. DELETE so quando
// nenhum Lead a usa; caso contrario sugere desativar (ativo=false).
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
  let body: { nome?: string; ativo?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const data: Prisma.EmpresaFaturadaUncheckedUpdateInput = {};
  if (body.nome !== undefined) {
    const nome = body.nome.trim();
    if (!nome) {
      return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
    }
    data.nome = nome;
  }
  if (body.ativo !== undefined) data.ativo = body.ativo;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }
  try {
    const empresa = await prisma.empresaFaturada.update({ where: { id }, data });
    return NextResponse.json({ empresa });
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      return NextResponse.json(
        { erro: "ja existe uma empresa com esse nome" },
        { status: 409 },
      );
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
  const usos = await prisma.lead.count({ where: { empresaFaturadaId: id } });
  if (usos > 0) {
    return NextResponse.json(
      {
        erro: `empresa em uso por ${usos} cliente(s); desative-a em vez de remover`,
      },
      { status: 409 },
    );
  }
  await prisma.empresaFaturada.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Edita ou exclui uma resposta rapida PESSOAL. O atendente so mexe nas suas
// (criadoPorId = ele); nunca nas de sistema.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { Prisma } from "@/generated/prisma/client";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function donoDaPropria(id: string, agenteId: string): Promise<boolean> {
  const r = await prisma.respostaRapida.findUnique({
    where: { id },
    select: { criadoPorId: true },
  });
  return !!r && r.criadoPorId === agenteId;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await donoDaPropria(id, agente.id))) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  let body: {
    titulo?: string;
    atalho?: string | null;
    texto?: string;
    ativo?: boolean;
    categoria?: string;
    finalidade?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const data: Prisma.RespostaRapidaUncheckedUpdateInput = {};
  if (body.titulo !== undefined) data.titulo = body.titulo.trim();
  if (body.atalho !== undefined) data.atalho = body.atalho?.trim() || null;
  if (body.texto !== undefined) data.texto = body.texto.trim();
  if (body.ativo !== undefined) data.ativo = body.ativo;
  if (body.categoria !== undefined)
    data.categoria = body.categoria.trim() || "geral";
  if (body.finalidade !== undefined) {
    data.finalidade =
      body.finalidade === Finalidade.VENDA ||
      body.finalidade === Finalidade.POS_VENDA
        ? body.finalidade
        : null;
  }
  const resposta = await prisma.respostaRapida.update({ where: { id }, data });
  return NextResponse.json({ resposta });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await donoDaPropria(id, agente.id))) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  await prisma.respostaRapida.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Edicao de uma peca (SO ADMIN). Fatia 3.01. Campos: nome, categoria, modelo,
// precoSugerido, ativo, estoqueMinimo, ordem. Estoque NAO se edita aqui — muda
// somente por movimentacao (POST /api/pecas/[id]/movimentar).
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function txt(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente || !ehAdmin(agente.papel)) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const existente = await prisma.produtoCatalogo.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existente) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }

  const data: Prisma.ProdutoCatalogoUncheckedUpdateInput = {};
  if (body.nome !== undefined) {
    const nome = txt(body.nome);
    if (!nome) return NextResponse.json({ erro: "nome invalido" }, { status: 400 });
    data.nome = nome;
  }
  if (body.categoria !== undefined) data.categoria = txt(body.categoria);
  if (body.modelo !== undefined) data.modelo = txt(body.modelo);
  if (body.precoSugerido !== undefined) {
    const n = Number(body.precoSugerido);
    data.precoSugerido =
      body.precoSugerido == null || body.precoSugerido === ""
        ? null
        : Number.isFinite(n) && n >= 0
          ? n
          : undefined;
  }
  if (body.estoqueMinimo !== undefined) {
    const n = Number(body.estoqueMinimo);
    data.estoqueMinimo =
      body.estoqueMinimo == null || body.estoqueMinimo === ""
        ? null
        : Number.isFinite(n) && n >= 0
          ? Math.round(n)
          : undefined;
  }
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);
  if (body.ordem !== undefined) {
    const n = Number(body.ordem);
    if (Number.isFinite(n)) data.ordem = Math.round(n);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  await prisma.produtoCatalogo.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

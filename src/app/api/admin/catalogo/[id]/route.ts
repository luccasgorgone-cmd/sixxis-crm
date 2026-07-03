// Admin: atualiza (PUT) ou remove (DELETE) um item do catalogo.
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { TipoCatalogo } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function precoNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function txt(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const data: Prisma.ProdutoCatalogoUpdateInput = {};
  if (body.nome !== undefined) {
    const n = txt(body.nome);
    if (n) data.nome = n;
  }
  if (body.categoria !== undefined) data.categoria = txt(body.categoria);
  if (body.modelo !== undefined) data.modelo = txt(body.modelo);
  if (body.precoSugerido !== undefined) data.precoSugerido = precoNum(body.precoSugerido);
  if (body.tipo !== undefined) {
    data.tipo = body.tipo === TipoCatalogo.PECA ? TipoCatalogo.PECA : TipoCatalogo.PRODUTO;
  }
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);

  const item = await prisma.produtoCatalogo.update({
    where: { id },
    data,
    select: { id: true, ativo: true },
  });
  return NextResponse.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.produtoCatalogo.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}

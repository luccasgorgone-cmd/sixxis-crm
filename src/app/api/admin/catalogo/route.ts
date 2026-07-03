// Admin: catalogo de produtos e pecas. GET (lista tudo) e POST (cria).
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { TipoCatalogo } from "@/generated/prisma/enums";

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

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const itens = await prisma.produtoCatalogo.findMany({
    orderBy: [{ tipo: "asc" }, { categoria: "asc" }, { ordem: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      categoria: true,
      modelo: true,
      precoSugerido: true,
      tipo: true,
      ativo: true,
      ordem: true,
    },
  });
  return NextResponse.json({
    itens: itens.map((i) => ({
      ...i,
      precoSugerido: i.precoSugerido != null ? Number(i.precoSugerido) : null,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const nome = txt(body.nome);
  if (!nome) return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
  const tipo = body.tipo === TipoCatalogo.PECA ? TipoCatalogo.PECA : TipoCatalogo.PRODUTO;
  const ultima = await prisma.produtoCatalogo.findFirst({
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const item = await prisma.produtoCatalogo.create({
    data: {
      nome,
      categoria: txt(body.categoria),
      modelo: txt(body.modelo),
      precoSugerido: precoNum(body.precoSugerido),
      tipo,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: item.id });
}

// Pecas (ProdutoCatalogo tipo=PECA) com estoque. Fatia 3.01.
// GET: lista para ADMIN ou usuario com acesso POS-VENDA (vendedor puro -> 403).
//      Filtros: categoria, busca (nome/modelo), incluirInativas (so admin).
// POST: cria peca (SO ADMIN).
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, podePosVenda, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { TipoCatalogo } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function precoNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function intOuNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function txt(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  // Pecas sao ferramenta de pos-venda: admin ou quem tem acesso pos-venda.
  if (!podePosVenda(agente)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const admin = ehAdmin(agente.papel);
  const where: Prisma.ProdutoCatalogoWhereInput = { tipo: TipoCatalogo.PECA };
  // Inativas: so o admin pode listar (e so quando pede explicitamente).
  if (!(admin && sp.get("incluirInativas") === "1")) where.ativo = true;

  const categoria = sp.get("categoria")?.trim();
  if (categoria) where.categoria = { equals: categoria, mode: "insensitive" };

  const busca = sp.get("busca")?.trim();
  if (busca) {
    where.OR = [
      { nome: { contains: busca, mode: "insensitive" } },
      { modelo: { contains: busca, mode: "insensitive" } },
    ];
  }

  const itens = await prisma.produtoCatalogo.findMany({
    where,
    orderBy: [{ categoria: "asc" }, { nome: "asc" }, { ordem: "asc" }, { modelo: "asc" }],
    select: {
      id: true,
      nome: true,
      categoria: true,
      modelo: true,
      precoSugerido: true,
      estoque: true,
      estoqueMinimo: true,
      ativo: true,
      ordem: true,
    },
  });
  return NextResponse.json({
    podeEditar: admin,
    itens: itens.map((i) => ({
      ...i,
      precoSugerido: i.precoSugerido != null ? Number(i.precoSugerido) : null,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente || !ehAdmin(agente.papel)) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const nome = txt(body.nome);
  if (!nome) return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
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
      estoqueMinimo: intOuNull(body.estoqueMinimo),
      tipo: TipoCatalogo.PECA,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: item.id });
}

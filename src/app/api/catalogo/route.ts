// Catalogo de produtos/pecas ATIVOS para montar pedidos (modal de ganho e ficha).
// Leitura para qualquer usuario logado. Filtros: tipo (PRODUTO|PECA), categoria.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { TipoCatalogo } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const where: Prisma.ProdutoCatalogoWhereInput = { ativo: true };
  const tipo = sp.get("tipo");
  if (tipo === TipoCatalogo.PRODUTO || tipo === TipoCatalogo.PECA) {
    where.tipo = tipo;
  }
  const categoria = sp.get("categoria")?.trim();
  if (categoria) where.categoria = { equals: categoria, mode: "insensitive" };

  const itens = await prisma.produtoCatalogo.findMany({
    where,
    orderBy: [{ categoria: "asc" }, { ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, categoria: true, modelo: true, precoSugerido: true, tipo: true },
  });
  return NextResponse.json({
    itens: itens.map((i) => ({
      ...i,
      precoSugerido: i.precoSugerido != null ? Number(i.precoSugerido) : null,
    })),
  });
}

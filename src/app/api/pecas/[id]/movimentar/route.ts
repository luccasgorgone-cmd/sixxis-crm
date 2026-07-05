// Movimentacao manual de estoque de uma peca (SO ADMIN). Fatia 3.01.
// tipo: ENTRADA | SAIDA | AJUSTE. Para ENTRADA/SAIDA a quantidade e o delta;
// para AJUSTE e o novo valor absoluto do estoque. Usa o helper movimentarPeca.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { movimentarPeca, type TipoMovPeca } from "@/lib/pecas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS_MANUAIS: TipoMovPeca[] = ["ENTRADA", "SAIDA", "AJUSTE"];

export async function POST(
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

  const tipo = body.tipo as TipoMovPeca;
  if (!TIPOS_MANUAIS.includes(tipo)) {
    return NextResponse.json({ erro: "tipo invalido" }, { status: 400 });
  }
  const quantidade = Number(body.quantidade);
  if (!Number.isFinite(quantidade) || quantidade < 0) {
    return NextResponse.json({ erro: "quantidade invalida" }, { status: 400 });
  }
  // ENTRADA/SAIDA: delta precisa ser > 0. AJUSTE: 0 e valido (zerar o estoque).
  if (tipo !== "AJUSTE" && quantidade <= 0) {
    return NextResponse.json({ erro: "quantidade deve ser maior que zero" }, { status: 400 });
  }

  const peca = await prisma.produtoCatalogo.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!peca) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }

  const motivo = typeof body.motivo === "string" ? body.motivo.trim() || null : null;
  const r = await movimentarPeca({
    pecaId: id,
    tipo,
    quantidade,
    motivo,
    agenteId: agente.id,
  });
  return NextResponse.json({ ok: true, estoque: r.estoqueDepois });
}

// Pecas APLICADAS num item da assistencia (aba Local, Fatia 3.06). Diferente do
// planejamento de negocio, AQUI a peca sai do estoque IMEDIATAMENTE: a criacao
// movimenta SAIDA e a remocao (rota [pecaUsoId]) faz ESTORNO. Gate: podePosVenda.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podePosVenda } from "@/lib/autorizacao";
import { TipoCatalogo } from "@/generated/prisma/enums";
import { movimentarPeca } from "@/lib/pecas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsoRow = {
  id: string;
  quantidade: number;
  garantia: boolean;
  peca: {
    id: string;
    nome: string;
    modelo: string | null;
    precoSugerido: unknown;
    estoque: number;
  };
};

const selectUso = {
  id: true,
  quantidade: true,
  garantia: true,
  peca: {
    select: { id: true, nome: true, modelo: true, precoSugerido: true, estoque: true },
  },
} as const;

function serializarUso(u: UsoRow) {
  return {
    id: u.id,
    quantidade: u.quantidade,
    garantia: u.garantia,
    pecaId: u.peca.id,
    nome: u.peca.nome,
    modelo: u.peca.modelo,
    precoSugerido: u.peca.precoSugerido != null ? Number(u.peca.precoSugerido) : null,
    estoque: u.peca.estoque,
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  if (!podePosVenda(agente)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const usos = await prisma.pecaUso.findMany({
    where: { itemLocalId: id, origem: "LOCAL" },
    orderBy: { criadoEm: "asc" },
    select: selectUso,
  });
  return NextResponse.json({ pecas: usos.map(serializarUso) });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  if (!podePosVenda(agente)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const item = await prisma.itemLocal.findUnique({
    where: { id },
    select: { id: true, leadId: true },
  });
  if (!item) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const pecaId = typeof body.pecaId === "string" ? body.pecaId : "";
  const quantidade = Math.round(Number(body.quantidade));
  if (!pecaId || !Number.isFinite(quantidade) || quantidade < 1 || quantidade > 99) {
    return NextResponse.json({ erro: "peca/quantidade invalida" }, { status: 400 });
  }
  const peca = await prisma.produtoCatalogo.findUnique({
    where: { id: pecaId },
    select: { id: true, tipo: true, ativo: true },
  });
  if (!peca || peca.tipo !== TipoCatalogo.PECA || !peca.ativo) {
    return NextResponse.json({ erro: "peca invalida" }, { status: 400 });
  }

  // MESMA transacao: registra o uso E movimenta a baixa (SAIDA) do estoque.
  const uso = await prisma.$transaction(async (tx) => {
    const novo = await tx.pecaUso.create({
      data: {
        origem: "LOCAL",
        itemLocalId: id,
        pecaId,
        quantidade,
        garantia: body.garantia === true,
        agenteId: agente.id,
      },
      select: selectUso,
    });
    await movimentarPeca({
      tx,
      pecaId,
      tipo: "SAIDA",
      quantidade,
      motivo: "assistencia local",
      itemLocalId: id,
      leadId: item.leadId,
      agenteId: agente.id,
    });
    return novo;
  });
  return NextResponse.json({ peca: serializarUso(uso) });
}

// Historico de movimentacoes de uma peca (desc, ate 100). Fatia 3.01.
// Le: ADMIN ou usuario com acesso POS-VENDA. Enriquece cada linha com o nome do
// agente e, quando a movimentacao veio de um negocio (leadId), o nome do cliente.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, podePosVenda } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { nomeEfetivo } from "@/lib/cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!podePosVenda(agente)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;

  // Peca inexistente -> 404 (nao devolve lista vazia como se existisse).
  const peca = await prisma.produtoCatalogo.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!peca) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }

  const movs = await prisma.movimentacaoPeca.findMany({
    where: { pecaId: id },
    orderBy: { criadoEm: "desc" },
    take: 100,
    select: {
      id: true,
      tipo: true,
      quantidade: true,
      motivo: true,
      negocioId: true,
      leadId: true,
      agenteId: true,
      criadoEm: true,
    },
  });

  // Nomes de agente e cliente em lote (leadId/agenteId sao campos livres, sem FK).
  const agenteIds = [...new Set(movs.map((m) => m.agenteId).filter(Boolean) as string[])];
  const leadIds = [...new Set(movs.map((m) => m.leadId).filter(Boolean) as string[])];
  const [agentes, leads] = await Promise.all([
    agenteIds.length
      ? prisma.agente.findMany({
          where: { id: { in: agenteIds } },
          select: { id: true, nome: true },
        })
      : Promise.resolve([]),
    leadIds.length
      ? prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, nome: true, pushName: true, nomeManual: true, telefone: true },
        })
      : Promise.resolve([]),
  ]);
  const nomeAgente = new Map(agentes.map((a) => [a.id, a.nome]));
  const nomeLead = new Map(leads.map((l) => [l.id, nomeEfetivo(l)]));

  return NextResponse.json({
    movimentacoes: movs.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      quantidade: m.quantidade,
      motivo: m.motivo,
      criadoEm: m.criadoEm,
      agente: m.agenteId ? nomeAgente.get(m.agenteId) ?? null : null,
      negocioId: m.negocioId,
      cliente: m.leadId ? nomeLead.get(m.leadId) ?? null : null,
    })),
  });
}

// Remove (DELETE) ou ajusta a quantidade (PATCH) de uma peca NECESSARIA
// (planejamento) de um negocio (Fatia 3.06 / 3.16). Staging: NAO movimenta estoque.
// Gate: escopo do negocio (dono negocio / dono cliente na finalidade / admin).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio, type SessaoAgente } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Carrega o negocio e valida o acesso de ESCRITA (mesmo criterio das outras rotas
// de staging). Retorna null quando nao existe / sem permissao (o caller responde).
async function negocioComAcesso(
  agente: SessaoAgente,
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; erro: string }> {
  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      agenteId: true,
      finalidade: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) return { ok: false, status: 404, erro: "nao encontrado" };
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return { ok: false, status: 403, erro: "sem permissao" };
  }
  return { ok: true };
}

// PATCH: ajusta a quantidade (1..99) de um item do staging. Nao movimenta estoque
// (o pedido so materializa no fechamento). 404 se o item nao for deste negocio.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; pecaUsoId: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id, pecaUsoId } = await ctx.params;

  const acesso = await negocioComAcesso(agente, id);
  if (!acesso.ok) {
    return NextResponse.json({ erro: acesso.erro }, { status: acesso.status });
  }

  let body: { quantidade?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const quantidade = Math.round(Number(body.quantidade));
  if (!Number.isFinite(quantidade) || quantidade < 1 || quantidade > 99) {
    return NextResponse.json({ erro: "quantidade invalida (1 a 99)" }, { status: 400 });
  }

  // Escopo do update: item deste negocio e do staging (origem NEGOCIO).
  const r = await prisma.pecaUso.updateMany({
    where: { id: pecaUsoId, negocioId: id, origem: "NEGOCIO" },
    data: { quantidade },
  });
  if (r.count === 0) {
    return NextResponse.json({ erro: "item nao encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, quantidade });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; pecaUsoId: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id, pecaUsoId } = await ctx.params;

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      agenteId: true,
      finalidade: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // So remove se pertencer a este negocio (staging origem NEGOCIO).
  await prisma.pecaUso.deleteMany({
    where: { id: pecaUsoId, negocioId: id, origem: "NEGOCIO" },
  });
  return NextResponse.json({ ok: true });
}

// Edita (PATCH) ou remove (DELETE) um orcamento. Gate: dono do cliente (venda/
// pos), agente de alguma conversa do lead, ou admin.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function podeGerenciar(
  agente: { id: string; papel: import("@/generated/prisma/enums").Papel },
  leadId: string,
): Promise<boolean> {
  if (ehAdmin(agente.papel)) return true;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      donoId: true,
      donoPosVendaId: true,
      conversas: { select: { agenteId: true } },
    },
  });
  if (!lead) return false;
  return (
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id ||
    lead.conversas.some((c) => c.agenteId === agente.id)
  );
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
  const orc = await prisma.orcamento.findUnique({
    where: { id },
    select: { id: true, leadId: true },
  });
  if (!orc) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!(await podeGerenciar(agente, orc.leadId))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: {
    produto?: string;
    valor?: number | string | null;
    voltagem?: string | null;
    observacao?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Prisma.OrcamentoUncheckedUpdateInput = {};
  if (body.produto !== undefined) {
    const p = String(body.produto).trim();
    if (!p) {
      return NextResponse.json({ erro: "produto obrigatorio" }, { status: 400 });
    }
    data.produto = p;
  }
  if (body.valor !== undefined) {
    if (body.valor === null || body.valor === "") {
      data.valor = null;
    } else {
      const v = Number(String(body.valor).replace(",", "."));
      data.valor = Number.isFinite(v) ? v : null;
    }
  }
  if (body.voltagem !== undefined) data.voltagem = body.voltagem?.trim() || null;
  if (body.observacao !== undefined) {
    data.observacao = body.observacao?.trim() || null;
  }

  const atualizado = await prisma.orcamento.update({ where: { id }, data });
  return NextResponse.json({
    orcamento: {
      ...atualizado,
      valor: atualizado.valor != null ? Number(atualizado.valor) : null,
    },
  });
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
  const orc = await prisma.orcamento.findUnique({
    where: { id },
    select: { id: true, leadId: true },
  });
  if (!orc) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!(await podeGerenciar(agente, orc.leadId))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  await prisma.orcamento.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

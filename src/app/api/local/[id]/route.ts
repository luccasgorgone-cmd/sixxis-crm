// Item em assistencia: detalhe (GET), atualizacao (PUT — muda status/campos) e
// remocao (DELETE). Permissao: ADMIN e POS_VENDA. Marcar ENTREGUE preenche a
// dataSaida automaticamente.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { nomeEfetivo, selectClienteBasico } from "@/lib/cliente";
import { Papel, StatusAssistencia } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALIDOS = new Set<string>(Object.values(StatusAssistencia));

function podeLocal(papel: Papel): boolean {
  return papel === Papel.ADMIN || papel === Papel.POS_VENDA;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  if (!podeLocal(agente.papel)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const it = await prisma.itemLocal.findUnique({
    where: { id },
    include: { lead: { select: selectClienteBasico } },
  });
  if (!it) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  return NextResponse.json({
    item: {
      ...it,
      leadNome: it.lead ? nomeEfetivo(it.lead) : null,
      leadFoto: it.lead?.fotoUrl ?? null,
    },
  });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  if (!podeLocal(agente.papel)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const existente = await prisma.itemLocal.findUnique({
    where: { id },
    select: { id: true, dataSaida: true },
  });
  if (!existente) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });

  const txt = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s || null;
  };
  const data: Prisma.ItemLocalUpdateInput = {};
  if (body.descricaoProduto !== undefined) {
    const d = String(body.descricaoProduto).trim();
    if (d) data.descricaoProduto = d;
  }
  if (body.modelo !== undefined) data.modelo = txt(body.modelo);
  if (body.categoria !== undefined) data.categoria = txt(body.categoria);
  if (body.numeroSerie !== undefined) data.numeroSerie = txt(body.numeroSerie);
  if (body.defeitoRelatado !== undefined) data.defeitoRelatado = txt(body.defeitoRelatado);
  if (body.localizacao !== undefined) data.localizacao = txt(body.localizacao);
  if (body.tecnicoResponsavel !== undefined) data.tecnicoResponsavel = txt(body.tecnicoResponsavel);
  if (body.observacoes !== undefined) data.observacoes = txt(body.observacoes);
  if (body.leadId !== undefined) {
    const lid = txt(body.leadId);
    data.lead = lid ? { connect: { id: lid } } : { disconnect: true };
  }
  if (typeof body.status === "string" && STATUS_VALIDOS.has(body.status)) {
    data.status = body.status as StatusAssistencia;
    // Marcar ENTREGUE preenche a saida; sair de ENTREGUE limpa a saida.
    if (body.status === StatusAssistencia.ENTREGUE) {
      if (!existente.dataSaida) data.dataSaida = new Date();
    } else {
      data.dataSaida = null;
    }
  }

  const atualizado = await prisma.itemLocal.update({
    where: { id },
    data,
    select: { id: true, status: true },
  });
  return NextResponse.json({ item: atualizado });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  if (!podeLocal(agente.papel)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.itemLocal.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}

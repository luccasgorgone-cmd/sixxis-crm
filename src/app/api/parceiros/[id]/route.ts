// Parceiro individual: obter, editar e desativar (soft-delete). Leitura: qualquer
// agente logado. Escrita: ADMIN e POS_VENDA. Isolado de Lead/Negocio/metricas.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import {
  podeGerenciarParceiros,
  resolverLocal,
  parseFrete,
  textoOuNull,
  parseCategorias,
} from "@/lib/parceiro";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializar(p: {
  fretePadrao: Prisma.Decimal | null;
  [k: string]: unknown;
}) {
  return { ...p, fretePadrao: p.fretePadrao == null ? null : Number(p.fretePadrao) };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const parceiro = await prisma.parceiro.findUnique({ where: { id } });
  if (!parceiro) {
    return NextResponse.json({ erro: "parceiro nao encontrado" }, { status: 404 });
  }
  return NextResponse.json({ parceiro: serializar(parceiro) });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!podeGerenciarParceiros(agente.papel, agente.acessoPosVenda)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const atual = await prisma.parceiro.findUnique({ where: { id } });
  if (!atual) {
    return NextResponse.json({ erro: "parceiro nao encontrado" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Prisma.ParceiroUpdateInput = {};
  if (body.nome !== undefined) {
    const nome = textoOuNull(body.nome);
    if (!nome) {
      return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
    }
    data.nome = nome;
  }
  if (body.telefone !== undefined) data.telefone = textoOuNull(body.telefone);
  if (body.cidade !== undefined) data.cidade = textoOuNull(body.cidade);
  if (body.email !== undefined) data.email = textoOuNull(body.email);
  if (body.especialidade !== undefined) data.especialidade = textoOuNull(body.especialidade);
  if (body.categorias !== undefined) data.categorias = parseCategorias(body.categorias);
  if (body.observacoes !== undefined) data.observacoes = textoOuNull(body.observacoes);
  if (body.freteObs !== undefined) data.freteObs = textoOuNull(body.freteObs);
  if (body.fretePadrao !== undefined) data.fretePadrao = parseFrete(body.fretePadrao);
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);

  // Recalcula uf/regiao quando telefone ou uf mudaram (uf manual tem prioridade).
  if (body.telefone !== undefined || body.uf !== undefined) {
    const telefone = body.telefone !== undefined ? textoOuNull(body.telefone) : atual.telefone;
    const ufManual = body.uf !== undefined ? textoOuNull(body.uf) : atual.uf;
    const { uf, regiao } = resolverLocal({ telefone, uf: ufManual });
    data.uf = uf;
    data.regiao = regiao;
  }

  const parceiro = await prisma.parceiro.update({ where: { id }, data });
  return NextResponse.json({ parceiro: serializar(parceiro) });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!podeGerenciarParceiros(agente.papel, agente.acessoPosVenda)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const atual = await prisma.parceiro.findUnique({ where: { id }, select: { id: true } });
  if (!atual) {
    return NextResponse.json({ erro: "parceiro nao encontrado" }, { status: 404 });
  }
  // Soft-delete: desativa (preserva o historico; pode reativar via PUT).
  await prisma.parceiro.update({ where: { id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}

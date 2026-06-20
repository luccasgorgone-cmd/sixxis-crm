// Admin: edita ou remove uma meta. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { calcularProgresso, type MetaBase } from "@/lib/metas";
import { Prisma } from "@/generated/prisma/client";
import {
  MetricaMeta,
  EscopoMeta,
  PeriodoMeta,
  FinalidadeEtapa,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ehEnum<T extends Record<string, string>>(
  e: T,
  v: unknown,
): v is T[keyof T] {
  return typeof v === "string" && Object.values(e).includes(v);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Prisma.MetaUncheckedUpdateInput = {};

  if (body.nome !== undefined) {
    data.nome =
      typeof body.nome === "string" && body.nome.trim()
        ? body.nome.trim()
        : null;
  }
  if (body.escopo !== undefined) {
    if (!ehEnum(EscopoMeta, body.escopo)) {
      return NextResponse.json({ erro: "escopo invalido" }, { status: 400 });
    }
    data.escopo = body.escopo;
    // Equipe nunca tem agente vinculado.
    if (body.escopo === EscopoMeta.EQUIPE) data.agenteId = null;
  }
  if (body.agenteId !== undefined) {
    data.agenteId =
      typeof body.agenteId === "string" && body.agenteId
        ? body.agenteId
        : null;
  }
  if (body.finalidade !== undefined) {
    if (!ehEnum(FinalidadeEtapa, body.finalidade)) {
      return NextResponse.json(
        { erro: "finalidade invalida" },
        { status: 400 },
      );
    }
    data.finalidade = body.finalidade;
  }
  if (body.metrica !== undefined) {
    if (!ehEnum(MetricaMeta, body.metrica)) {
      return NextResponse.json({ erro: "metrica invalida" }, { status: 400 });
    }
    data.metrica = body.metrica;
  }
  if (body.periodo !== undefined) {
    if (!ehEnum(PeriodoMeta, body.periodo)) {
      return NextResponse.json({ erro: "periodo invalido" }, { status: 400 });
    }
    data.periodo = body.periodo;
  }
  if (body.alvo !== undefined) {
    const alvo = Number(body.alvo);
    if (!Number.isFinite(alvo) || alvo <= 0) {
      return NextResponse.json(
        { erro: "alvo deve ser maior que zero" },
        { status: 400 },
      );
    }
    data.alvo = alvo;
  }
  if (body.inicio !== undefined) {
    const inicio = new Date(String(body.inicio));
    if (Number.isNaN(inicio.getTime())) {
      return NextResponse.json({ erro: "inicio invalido" }, { status: 400 });
    }
    data.inicio = inicio;
  }
  if (body.fim !== undefined) {
    const fim = new Date(String(body.fim));
    if (Number.isNaN(fim.getTime())) {
      return NextResponse.json({ erro: "fim invalido" }, { status: 400 });
    }
    data.fim = fim;
  }
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);

  try {
    const meta = await prisma.meta.update({
      where: { id },
      data,
      include: { agente: { select: { id: true, nome: true } } },
    });
    if (meta.fim.getTime() <= meta.inicio.getTime()) {
      return NextResponse.json(
        { erro: "o fim deve ser depois do inicio" },
        { status: 400 },
      );
    }
    const progresso = await calcularProgresso(meta as MetaBase);
    return NextResponse.json({ meta: { ...meta, progresso } });
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2025"
    ) {
      return NextResponse.json(
        { erro: "meta nao encontrada" },
        { status: 404 },
      );
    }
    throw erro;
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.meta.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

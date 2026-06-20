// Admin: lista metas (com progresso apurado) e cria novas. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { calcularProgresso, type MetaBase } from "@/lib/metas";
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

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const metas = await prisma.meta.findMany({
    orderBy: [{ ativo: "desc" }, { criadoEm: "desc" }],
    include: { agente: { select: { id: true, nome: true } } },
  });
  const agora = new Date();
  const comProgresso = await Promise.all(
    metas.map(async (m) => ({
      ...m,
      progresso: await calcularProgresso(m as MetaBase, agora),
    })),
  );
  return NextResponse.json({ metas: comProgresso });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const escopo = body.escopo;
  const metrica = body.metrica;
  const periodo = body.periodo;
  const finalidade = (body.finalidade ?? FinalidadeEtapa.AMBAS) as unknown;
  const alvo = Number(body.alvo);
  const inicio = new Date(String(body.inicio ?? ""));
  const fim = new Date(String(body.fim ?? ""));
  const agenteId =
    typeof body.agenteId === "string" && body.agenteId ? body.agenteId : null;

  if (!ehEnum(EscopoMeta, escopo)) {
    return NextResponse.json({ erro: "escopo invalido" }, { status: 400 });
  }
  if (!ehEnum(MetricaMeta, metrica)) {
    return NextResponse.json({ erro: "metrica invalida" }, { status: 400 });
  }
  if (!ehEnum(PeriodoMeta, periodo)) {
    return NextResponse.json({ erro: "periodo invalido" }, { status: 400 });
  }
  if (!ehEnum(FinalidadeEtapa, finalidade)) {
    return NextResponse.json({ erro: "finalidade invalida" }, { status: 400 });
  }
  if (!Number.isFinite(alvo) || alvo <= 0) {
    return NextResponse.json(
      { erro: "alvo deve ser um numero maior que zero" },
      { status: 400 },
    );
  }
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return NextResponse.json({ erro: "datas invalidas" }, { status: 400 });
  }
  if (fim.getTime() <= inicio.getTime()) {
    return NextResponse.json(
      { erro: "o fim deve ser depois do inicio" },
      { status: 400 },
    );
  }
  if (escopo === EscopoMeta.COLABORADOR) {
    if (!agenteId) {
      return NextResponse.json(
        { erro: "selecione o colaborador" },
        { status: 400 },
      );
    }
    const existe = await prisma.agente.findUnique({
      where: { id: agenteId },
      select: { id: true },
    });
    if (!existe) {
      return NextResponse.json(
        { erro: "colaborador nao encontrado" },
        { status: 400 },
      );
    }
  }

  const meta = await prisma.meta.create({
    data: {
      nome: typeof body.nome === "string" && body.nome.trim()
        ? body.nome.trim()
        : null,
      escopo,
      agenteId: escopo === EscopoMeta.COLABORADOR ? agenteId : null,
      finalidade,
      metrica,
      alvo,
      periodo,
      inicio,
      fim,
      ativo: body.ativo === undefined ? true : Boolean(body.ativo),
    },
    include: { agente: { select: { id: true, nome: true } } },
  });
  const progresso = await calcularProgresso(meta as MetaBase);
  return NextResponse.json({ meta: { ...meta, progresso } });
}

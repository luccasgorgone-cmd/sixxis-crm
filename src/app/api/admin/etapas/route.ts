// Admin: lista, cria e reordena etapas do funil. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { TipoEtapa } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const etapas = await prisma.etapa.findMany({
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      nome: true,
      cor: true,
      tipo: true,
      ordem: true,
      ativo: true,
      _count: { select: { negocios: true } },
    },
  });
  return NextResponse.json({
    etapas: etapas.map((e) => ({
      id: e.id,
      nome: e.nome,
      cor: e.cor,
      tipo: e.tipo,
      ordem: e.ordem,
      ativo: e.ativo,
      negocios: e._count.negocios,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { nome?: string; cor?: string; tipo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const nome = String(body?.nome ?? "").trim();
  if (!nome) {
    return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
  }
  const tipo =
    body?.tipo && body.tipo in TipoEtapa
      ? (body.tipo as TipoEtapa)
      : TipoEtapa.ABERTA;
  const ultima = await prisma.etapa.findFirst({
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const etapa = await prisma.etapa.create({
    data: {
      nome,
      cor: body.cor?.trim() || "#3cbfb3",
      tipo,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
  });
  return NextResponse.json({ etapa });
}

// Reordena: body { ordem: [id1, id2, ...] } -> ordem = indice + 1.
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { ordem?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  if (!Array.isArray(body?.ordem)) {
    return NextResponse.json({ erro: "ordem invalida" }, { status: 400 });
  }
  await prisma.$transaction(
    body.ordem.map((id, i) =>
      prisma.etapa.update({ where: { id }, data: { ordem: i + 1 } }),
    ),
  );
  return NextResponse.json({ ok: true });
}

// Admin: lista, cria e reordena empresas faturadas. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const empresas = await prisma.empresaFaturada.findMany({
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      ativo: true,
      ordem: true,
      _count: { select: { leads: true } },
    },
  });
  return NextResponse.json({
    empresas: empresas.map((e) => ({
      id: e.id,
      nome: e.nome,
      ativo: e.ativo,
      ordem: e.ordem,
      usos: e._count.leads,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { nome?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const nome = String(body?.nome ?? "").trim();
  if (!nome) {
    return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
  }
  const ultima = await prisma.empresaFaturada.findFirst({
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  try {
    const empresa = await prisma.empresaFaturada.create({
      data: { nome, ordem: (ultima?.ordem ?? -1) + 1 },
    });
    return NextResponse.json({ empresa });
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      return NextResponse.json(
        { erro: "ja existe uma empresa com esse nome" },
        { status: 409 },
      );
    }
    throw erro;
  }
}

// Reordena: body { ordem: [id1, id2, ...] } -> ordem = indice.
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
      prisma.empresaFaturada.update({ where: { id }, data: { ordem: i } }),
    ),
  );
  return NextResponse.json({ ok: true });
}

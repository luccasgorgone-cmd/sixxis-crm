// Admin: lista, cria e reordena respostas rapidas. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "VENDA" | "POS_VENDA" | outro -> null (ambas).
function normalizarFinalidade(v: unknown): Finalidade | null {
  return v === Finalidade.VENDA || v === Finalidade.POS_VENDA ? v : null;
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const respostas = await prisma.respostaRapida.findMany({
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
  });
  return NextResponse.json({ respostas });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: {
    titulo?: string;
    atalho?: string;
    texto?: string;
    categoria?: string;
    finalidade?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const titulo = String(body?.titulo ?? "").trim();
  const texto = String(body?.texto ?? "").trim();
  if (!titulo || !texto) {
    return NextResponse.json(
      { erro: "titulo e texto sao obrigatorios" },
      { status: 400 },
    );
  }
  const ultima = await prisma.respostaRapida.findFirst({
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const resposta = await prisma.respostaRapida.create({
    data: {
      titulo,
      atalho: body.atalho?.trim() || null,
      texto,
      categoria: body.categoria?.trim() || "geral",
      finalidade: normalizarFinalidade(body.finalidade),
      ordem: (ultima?.ordem ?? 0) + 1,
    },
  });
  return NextResponse.json({ resposta });
}

// Reordena: body { ordem: [id1, id2, ...] }.
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
      prisma.respostaRapida.update({ where: { id }, data: { ordem: i + 1 } }),
    ),
  );
  return NextResponse.json({ ok: true });
}

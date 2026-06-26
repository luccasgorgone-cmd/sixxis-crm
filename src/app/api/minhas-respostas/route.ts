// Respostas rapidas PESSOAIS do atendente (criadoPorId = ele). Lista todas as
// dele (ativas e inativas), cria novas e reordena. Cada um so mexe nas suas.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizarFinalidade(v: unknown): Finalidade | null {
  return v === Finalidade.VENDA || v === Finalidade.POS_VENDA ? v : null;
}

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const respostas = await prisma.respostaRapida.findMany({
    where: { criadoPorId: agente.id },
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
  });
  return NextResponse.json({ respostas });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
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
  // Ordem dentro das proprias do agente.
  const ultima = await prisma.respostaRapida.findFirst({
    where: { criadoPorId: agente.id },
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
      criadoPorId: agente.id,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
  });
  return NextResponse.json({ resposta });
}

// Reordena as proprias: body { ordem: [id1, id2, ...] }. So afeta as do agente.
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
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
      prisma.respostaRapida.updateMany({
        where: { id, criadoPorId: agente.id },
        data: { ordem: i + 1 },
      }),
    ),
  );
  return NextResponse.json({ ok: true });
}

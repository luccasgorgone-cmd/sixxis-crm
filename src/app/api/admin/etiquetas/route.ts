// Admin: lista e cria etiquetas. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const etiquetas = await prisma.etiqueta.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      cor: true,
      _count: { select: { leads: true } },
    },
  });
  return NextResponse.json({
    etiquetas: etiquetas.map((e) => ({
      id: e.id,
      nome: e.nome,
      cor: e.cor,
      usos: e._count.leads,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { nome?: string; cor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const nome = String(body?.nome ?? "").trim();
  if (!nome) {
    return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
  }
  const etiqueta = await prisma.etiqueta.create({
    data: { nome, cor: body.cor?.trim() || "#3cbfb3" },
  });
  return NextResponse.json({ etiqueta });
}

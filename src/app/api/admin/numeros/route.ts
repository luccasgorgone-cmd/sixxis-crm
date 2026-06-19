// Admin: lista e cria numeros de WhatsApp (instancias Evolution). Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const numeros = await prisma.instanciaWhatsApp.findMany({
    orderBy: { criadoEm: "asc" },
  });
  return NextResponse.json({ numeros });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: {
    nome?: string;
    instanciaEvolution?: string;
    numero?: string;
    finalidade?: string;
    ativo?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const nome = String(body?.nome ?? "").trim();
  const instanciaEvolution = String(body?.instanciaEvolution ?? "").trim();
  if (!nome || !instanciaEvolution) {
    return NextResponse.json(
      { erro: "nome e instanciaEvolution sao obrigatorios" },
      { status: 400 },
    );
  }
  const finalidade =
    body?.finalidade === Finalidade.POS_VENDA
      ? Finalidade.POS_VENDA
      : Finalidade.VENDA;
  try {
    const numero = await prisma.instanciaWhatsApp.create({
      data: {
        nome,
        instanciaEvolution,
        numero: body.numero?.trim() || null,
        finalidade,
        ativo: body.ativo ?? true,
      },
    });
    return NextResponse.json({ numero });
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      return NextResponse.json(
        { erro: "ja existe uma instancia com esse identificador" },
        { status: 409 },
      );
    }
    throw erro;
  }
}

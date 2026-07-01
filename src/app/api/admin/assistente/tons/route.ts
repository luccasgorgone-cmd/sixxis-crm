// Admin: CRUD dos tons do assistente de escrita. GET (lista tudo) e POST (cria).
// Edicao/exclusao ficam em ./tons/[id]. Somente ADMIN.
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
  const tons = await prisma.assistenteTom.findMany({
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
  });
  return NextResponse.json({ tons });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: {
    nome?: unknown;
    instrucao?: unknown;
    ordem?: unknown;
    ativo?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const nome = String(body?.nome ?? "").trim();
  const instrucao = String(body?.instrucao ?? "").trim();
  if (!nome || !instrucao) {
    return NextResponse.json(
      { erro: "nome e instrucao sao obrigatorios" },
      { status: 400 },
    );
  }
  const ordem =
    body.ordem !== undefined && Number.isFinite(Number(body.ordem))
      ? Math.max(0, Math.floor(Number(body.ordem)))
      : ((
          await prisma.assistenteTom.findFirst({
            orderBy: { ordem: "desc" },
            select: { ordem: true },
          })
        )?.ordem ?? 0) + 1;

  const tom = await prisma.assistenteTom.create({
    data: {
      nome,
      instrucao,
      ordem,
      ativo: body.ativo === undefined ? true : Boolean(body.ativo),
    },
  });
  return NextResponse.json({ tom });
}

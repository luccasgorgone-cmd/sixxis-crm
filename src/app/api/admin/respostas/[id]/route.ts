// Admin: edita ou remove uma resposta rapida.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Prisma } from "@/generated/prisma/client";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: {
    titulo?: string;
    atalho?: string | null;
    texto?: string;
    ativo?: boolean;
    categoria?: string;
    finalidade?: unknown;
    variacoes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const data: Prisma.RespostaRapidaUncheckedUpdateInput = {};
  if (body.titulo !== undefined) data.titulo = body.titulo.trim();
  if (body.atalho !== undefined) data.atalho = body.atalho?.trim() || null;
  if (body.texto !== undefined) data.texto = body.texto.trim();
  if (body.ativo !== undefined) data.ativo = body.ativo;
  if (body.categoria !== undefined) data.categoria = body.categoria.trim() || "geral";
  if (body.finalidade !== undefined) {
    data.finalidade =
      body.finalidade === Finalidade.VENDA ||
      body.finalidade === Finalidade.POS_VENDA
        ? body.finalidade
        : null;
  }
  if (body.variacoes !== undefined) {
    data.variacoes = Array.isArray(body.variacoes)
      ? body.variacoes
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter((x) => x.length > 0)
      : [];
  }

  const resposta = await prisma.respostaRapida.update({ where: { id }, data });
  return NextResponse.json({ resposta });
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
  await prisma.respostaRapida.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

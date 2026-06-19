// Admin: edita um agente (dados, papel, ativar/desativar, resetar senha).
import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Papel } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

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
    nome?: string;
    email?: string;
    papel?: string;
    telefone?: string | null;
    avatarUrl?: string | null;
    ativo?: boolean;
    senha?: string;
    acessoVenda?: boolean;
    acessoPosVenda?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Prisma.AgenteUncheckedUpdateInput = {};
  if (body.nome !== undefined) data.nome = body.nome.trim();
  if (body.email !== undefined) data.email = body.email.toLowerCase().trim();
  // Papel: apenas ADMIN ou COLABORADOR pela tela de Equipe.
  if (body.papel !== undefined) {
    data.papel = body.papel === Papel.ADMIN ? Papel.ADMIN : Papel.COLABORADOR;
  }
  if (body.telefone !== undefined) data.telefone = body.telefone?.trim() || null;
  if (body.avatarUrl !== undefined) {
    data.avatarUrl = body.avatarUrl?.trim() || null;
  }
  if (body.ativo !== undefined) data.ativo = body.ativo;
  if (body.senha) data.senha = await bcrypt.hash(body.senha, 10);
  if (body.acessoVenda !== undefined) data.acessoVenda = body.acessoVenda;
  if (body.acessoPosVenda !== undefined) {
    data.acessoPosVenda = body.acessoPosVenda;
  }
  // Admin sempre tem acesso aos dois.
  if (body.papel === Papel.ADMIN) {
    data.acessoVenda = true;
    data.acessoPosVenda = true;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  try {
    const agente = await prisma.agente.update({
      where: { id },
      data,
      select: {
        id: true,
        nome: true,
        email: true,
        papel: true,
        telefone: true,
        avatarUrl: true,
        ativo: true,
        acessoVenda: true,
        acessoPosVenda: true,
        ultimoLogin: true,
        criadoEm: true,
      },
    });
    return NextResponse.json({ agente });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (erro.code === "P2002") {
        return NextResponse.json(
          { erro: "email ja em uso" },
          { status: 409 },
        );
      }
      if (erro.code === "P2025") {
        return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
      }
    }
    throw erro;
  }
}

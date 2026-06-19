// Admin: lista e cria agentes (vendedores/pos-venda/admin). Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Papel } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const agentes = await prisma.agente.findMany({
    orderBy: { criadoEm: "asc" },
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
  return NextResponse.json({ agentes });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: {
    nome?: string;
    email?: string;
    senha?: string;
    papel?: string;
    telefone?: string;
    avatarUrl?: string;
    ativo?: boolean;
    acessoVenda?: boolean;
    acessoPosVenda?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const nome = String(body?.nome ?? "").trim();
  const email = String(body?.email ?? "").toLowerCase().trim();
  const senha = String(body?.senha ?? "");
  // Papel: ADMIN se pedido, senao COLABORADOR. (VENDEDOR/POS_VENDA sao legado.)
  const papel = body?.papel === Papel.ADMIN ? Papel.ADMIN : Papel.COLABORADOR;
  const ehAdminNovo = papel === Papel.ADMIN;
  // Acesso: admin tem ambos; colaborador conforme enviado (default so venda).
  const acessoVenda = ehAdminNovo ? true : (body.acessoVenda ?? true);
  const acessoPosVenda = ehAdminNovo ? true : (body.acessoPosVenda ?? false);

  if (!nome || !email || !senha) {
    return NextResponse.json(
      { erro: "nome, email e senha sao obrigatorios" },
      { status: 400 },
    );
  }

  try {
    const hash = await bcrypt.hash(senha, 10);
    const agente = await prisma.agente.create({
      data: {
        nome,
        email,
        senha: hash,
        papel,
        telefone: body.telefone?.trim() || null,
        avatarUrl: body.avatarUrl?.trim() || null,
        ativo: body.ativo ?? true,
        acessoVenda,
        acessoPosVenda,
      },
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
        criadoEm: true,
      },
    });
    return NextResponse.json({ agente });
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      return NextResponse.json(
        { erro: "ja existe um agente com esse email" },
        { status: 409 },
      );
    }
    throw erro;
  }
}

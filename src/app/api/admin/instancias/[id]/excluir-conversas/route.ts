// Exclusao FISICA das conversas de um NUMERO (instancia). SOMENTE ADMIN (gate no
// servidor). Escopo: Conversas cujo instanciaId = id (thread inteira + mensagens).
// GET = preview (contagem do que sera apagado). POST = executa em transacao.
// NAO toca no Lead nem em Negocios.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Preview: contagem de conversas e mensagens no escopo do numero.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const instancia = await prisma.instanciaWhatsApp.findUnique({
    where: { id },
    select: { id: true, nome: true, numero: true },
  });
  if (!instancia) {
    return NextResponse.json({ erro: "numero nao encontrado" }, { status: 404 });
  }
  const [conversas, mensagens] = await Promise.all([
    prisma.conversa.count({ where: { instanciaId: id } }),
    prisma.mensagem.count({ where: { conversa: { instanciaId: id } } }),
  ]);
  return NextResponse.json({ instancia, conversas, mensagens });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const instancia = await prisma.instanciaWhatsApp.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!instancia) {
    return NextResponse.json({ erro: "numero nao encontrado" }, { status: 404 });
  }

  // Em transacao: apaga as Mensagens das conversas do numero e depois as Conversas.
  const [msg, conv] = await prisma.$transaction([
    prisma.mensagem.deleteMany({ where: { conversa: { instanciaId: id } } }),
    prisma.conversa.deleteMany({ where: { instanciaId: id } }),
  ]);

  getIO()?.emit("conversa:excluida", { instanciaId: id });

  return NextResponse.json({
    ok: true,
    mensagensApagadas: msg.count,
    conversasApagadas: conv.count,
  });
}

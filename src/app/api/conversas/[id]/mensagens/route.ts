// Mensagens de uma conversa (ordem cronologica). Ao abrir, zera o contador de
// nao lidas e marca as mensagens IN como lidas.
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DirecaoMsg } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const conversa = await prisma.conversa.findUnique({
    where: { id },
    include: { lead: { select: { nome: true, telefone: true } } },
  });
  if (!conversa) {
    return NextResponse.json(
      { erro: "conversa nao encontrada" },
      { status: 404 },
    );
  }

  const mensagens = await prisma.mensagem.findMany({
    where: { conversaId: id },
    orderBy: { hora: "asc" },
    select: {
      id: true,
      direcao: true,
      tipo: true,
      conteudo: true,
      statusEnvio: true,
      hora: true,
    },
  });

  // Marca como lidas / zera o badge. Best-effort: nao falha a leitura.
  await prisma.$transaction([
    prisma.mensagem.updateMany({
      where: { conversaId: id, direcao: DirecaoMsg.IN, lida: false },
      data: { lida: true },
    }),
    prisma.conversa.update({
      where: { id },
      data: { naoLidas: 0 },
    }),
  ]);

  return NextResponse.json({
    conversa: {
      id: conversa.id,
      leadNome: conversa.lead.nome,
      leadTelefone: conversa.lead.telefone,
      atendidoPor: conversa.atendidoPor,
    },
    mensagens,
  });
}

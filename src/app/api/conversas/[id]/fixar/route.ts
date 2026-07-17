// Fatia Y: fixar/desafixar (pin) uma conversa. Alterna Conversa.fixadaEm entre
// now e null. A conversa fixada sobe ao topo da lista do Inbox e do Kanban (ver
// src/lib/ordenacao.ts). Emite "conversa:atualizada" para as telas recarregarem.
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
    select: { id: true, leadId: true, agenteId: true, finalidade: true, fixadaEm: true },
  });
  if (!conversa) {
    return NextResponse.json({ erro: "conversa nao encontrada" }, { status: 404 });
  }

  const fixadaEm = conversa.fixadaEm ? null : new Date();
  await prisma.conversa.update({ where: { id }, data: { fixadaEm } });

  getIO()?.emit("conversa:atualizada", {
    leadId: conversa.leadId,
    finalidade: conversa.finalidade,
  });

  return NextResponse.json({ ok: true, fixadaEm });
}

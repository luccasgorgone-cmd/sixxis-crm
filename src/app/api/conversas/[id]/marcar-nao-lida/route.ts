// Fatia Y: marcar uma conversa como NAO LIDA manualmente (estilo WhatsApp).
// Seta Conversa.marcadaNaoLida = true — independente do contador naoLidas (que
// e automatico da ingestao). Abrir a conversa zera ambos (ver a rota de
// mensagens). Emite "conversa:atualizada" para as telas refletirem o indicador.
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
    select: { id: true, leadId: true, agenteId: true, finalidade: true },
  });
  if (!conversa) {
    return NextResponse.json({ erro: "conversa nao encontrada" }, { status: 404 });
  }

  await prisma.conversa.update({
    where: { id },
    data: { marcadaNaoLida: true },
  });

  getIO()?.emit("conversa:atualizada", {
    leadId: conversa.leadId,
    finalidade: conversa.finalidade,
  });

  return NextResponse.json({ ok: true });
}

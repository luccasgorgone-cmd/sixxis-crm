// Fatia Y: marcar uma conversa como NAO LIDA manualmente (estilo WhatsApp).
// Seta Conversa.marcadaNaoLida = true — independente do contador naoLidas (que
// e automatico da ingestao). Abrir a conversa zera ambos (ver a rota de
// mensagens). Emite "conversa:atualizada" para as telas refletirem o indicador.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, acessoConversa } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Escopo: so admin, o atendente da conversa ou o dono do cliente
  // (src/lib/acessoConversa.ts). Inexistente segue para o 404 abaixo.
  if ((await acessoConversa(agente, id)) === "negado") {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

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

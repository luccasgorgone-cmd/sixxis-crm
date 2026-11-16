// Fatia Y: fixar/desafixar (pin) uma conversa. Alterna Conversa.fixadaEm entre
// now e null. A conversa fixada sobe ao topo da lista do Inbox e do Kanban (ver
// src/lib/ordenacao.ts). Emite "conversa:atualizada" para as telas recarregarem.
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

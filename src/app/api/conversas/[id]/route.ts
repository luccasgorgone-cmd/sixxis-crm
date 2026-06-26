// Exclusao FISICA de UMA conversa (e suas mensagens). SOMENTE ADMIN — gate no
// servidor (obterAdmin -> 403). Diferente do "apagar mensagem" (revoke que
// preserva): aqui o registro e removido em definitivo. Em transacao: apaga as
// Mensagens da conversa e depois a Conversa. NAO toca no Lead nem em Negocios.
// (Unica FK para Conversa e Mensagem.conversaId; nada referencia Mensagem.)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const conversa = await prisma.conversa.findUnique({
    where: { id },
    select: { id: true, leadId: true, agenteId: true },
  });
  if (!conversa) {
    return NextResponse.json({ erro: "conversa nao encontrada" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.mensagem.deleteMany({ where: { conversaId: id } }),
    prisma.conversa.delete({ where: { id } }),
  ]);

  // Remove a conversa das telas abertas (inbox/painel) em tempo real.
  getIO()?.emit("conversa:excluida", {
    conversaId: id,
    leadId: conversa.leadId,
    agenteId: conversa.agenteId,
  });

  return NextResponse.json({ ok: true });
}

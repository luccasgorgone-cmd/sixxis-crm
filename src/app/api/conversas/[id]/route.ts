// Exclusao FISICA do atendimento de um cliente a partir de uma conversa. SOMENTE
// ADMIN — gate no servidor (obterAdmin -> 403). Decisao de produto: "excluir
// conversa" remove o atendimento por completo (Inbox, Kanban, Carteira, Clientes):
// apaga a Conversa e suas Mensagens, os Negocios do lead e dependentes, e o
// proprio Lead. NAO mexe na configuracao. Diferente do "apagar mensagem" (revoke).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import { excluirLeadsCompleto } from "@/lib/exclusao";

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

  // Remove o atendimento completo do cliente (lead + negocios + conversas).
  const resumo = await excluirLeadsCompleto([conversa.leadId]);

  // Some de todas as telas: Inbox (conversa) e Kanban/Carteira (negocio).
  getIO()?.emit("conversa:excluida", {
    conversaId: id,
    leadId: conversa.leadId,
    agenteId: conversa.agenteId,
  });
  getIO()?.emit("negocio:atualizado", {
    negocioId: null,
    etapaId: null,
    motivo: "excluido",
  });

  return NextResponse.json({ ok: true, ...resumo });
}

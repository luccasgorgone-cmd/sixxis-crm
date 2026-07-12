// Remove uma nota fiscal de um cliente (DELETE). Gate: dono do cliente (venda/
// pos), dono da conversa ou admin (podeGerenciarLead). A NF precisa pertencer ao
// lead da URL (evita apagar de outro cliente via URL).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeGerenciarLead } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; nfId: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id, nfId } = await ctx.params;
  if (!(await podeGerenciarLead(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const res = await prisma.notaFiscal.deleteMany({
    where: { id: nfId, leadId: id },
  });
  if (res.count === 0) {
    return NextResponse.json({ erro: "nota fiscal nao encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

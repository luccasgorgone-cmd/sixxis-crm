// SAIR do grupo no WhatsApp (via Evolution) e arquivar da secao interna. Acao
// sensivel: o front exige confirmacao. ISOLADO: nao toca Lead/Conversa/metricas.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { sairGrupo } from "@/lib/evolution";

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

  const grupo = await prisma.grupoInterno.findUnique({
    where: { id },
    select: { id: true, jid: true, instancia: true },
  });
  if (!grupo) {
    return NextResponse.json({ erro: "grupo nao encontrado" }, { status: 404 });
  }

  const r = await sairGrupo(grupo.jid, grupo.instancia);
  if (!r.ok) {
    return NextResponse.json(
      { erro: "falha ao sair do grupo no WhatsApp" },
      { status: 502 },
    );
  }

  // Saiu no WhatsApp: arquiva da secao (nao recebe mais mensagens).
  await prisma.grupoInterno.update({
    where: { id },
    data: { arquivado: true },
  });

  getIO()?.emit("grupo:removido", { grupoId: id });
  return NextResponse.json({ ok: true });
}

// Arquiva (oculta da lista interna) um grupo. NAO sai do grupo no WhatsApp — so
// some da secao. ISOLADO: nao toca em Lead/Conversa/metricas.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
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

  const grupo = await prisma.grupoInterno.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!grupo) {
    return NextResponse.json({ erro: "grupo nao encontrado" }, { status: 404 });
  }

  await prisma.grupoInterno.update({
    where: { id },
    data: { arquivado: true },
  });

  getIO()?.emit("grupo:removido", { grupoId: id });
  return NextResponse.json({ ok: true });
}

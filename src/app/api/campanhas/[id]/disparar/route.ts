// DISPARO manual de uma campanha em RASCUNHO (acao do USUARIO, nunca do Oracle).
// Dono ou admin. So dispara rascunhos; passa para ENVIANDO e enfileira o worker
// (mesmo caminho do envio normal, com todas as validacoes).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { getCampaignsQueue } from "@/lib/queue";
import { getIO } from "@/lib/socket";
import { StatusCampanha } from "@/generated/prisma/enums";

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

  const campanha = await prisma.campanha.findUnique({
    where: { id },
    select: { id: true, agenteId: true, status: true, total: true },
  });
  if (!campanha) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (!ehAdmin(agente.papel) && campanha.agenteId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  if (campanha.status !== StatusCampanha.RASCUNHO) {
    return NextResponse.json(
      { erro: "apenas rascunhos podem ser disparados" },
      { status: 422 },
    );
  }
  if (campanha.total <= 0) {
    return NextResponse.json({ erro: "campanha sem destinatarios" }, { status: 422 });
  }

  const atualizada = await prisma.campanha.update({
    where: { id },
    data: { status: StatusCampanha.ENVIANDO, iniciadoEm: new Date() },
    select: { id: true, status: true, total: true },
  });

  // Enfileira o processamento (worker envia com throttle) — mesmo do envio normal.
  await getCampaignsQueue().add("enviar", { campanhaId: id }, { jobId: id });
  getIO()?.emit("campanha:nova", { campanhaId: id, agenteId: campanha.agenteId });

  return NextResponse.json({ campanha: atualizada });
}

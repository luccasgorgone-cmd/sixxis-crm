// Remove um codigo de rastreio de um negocio (DELETE). Escopo: dono do negocio
// ou admin (podeAcessarNegocio). O rastreio precisa pertencer ao negocio da URL.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; rastreioId: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id, rastreioId } = await ctx.params;

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: { id: true, agenteId: true },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!podeAcessarNegocio(agente, negocio.agenteId)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // So apaga se o rastreio for deste negocio (evita apagar de outro via URL).
  const res = await prisma.rastreioNegocio.deleteMany({
    where: { id: rastreioId, negocioId: negocio.id },
  });
  if (res.count === 0) {
    return NextResponse.json({ erro: "rastreio nao encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

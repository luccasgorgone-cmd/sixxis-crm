// Admin: remove uma figurinha. Nao afeta o historico — as mensagens ja enviadas
// guardam a propria mediaUrl.
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.figurinhaSixxis.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}

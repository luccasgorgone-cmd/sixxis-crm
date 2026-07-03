// Favoritar/desfavoritar uma figurinha (toggle). Favorito GLOBAL (figurinhas sao
// compartilhadas da empresa). Qualquer usuario logado pode marcar para acesso
// rapido; as favoritas aparecem no topo do seletor.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

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

  const fig = await prisma.figurinhaSixxis.findUnique({
    where: { id },
    select: { favorita: true },
  });
  if (!fig) {
    return NextResponse.json({ erro: "figurinha nao encontrada" }, { status: 404 });
  }

  const atualizada = await prisma.figurinhaSixxis.update({
    where: { id },
    data: { favorita: !fig.favorita },
    select: { id: true, favorita: true },
  });
  return NextResponse.json({ favorita: atualizada.favorita });
}

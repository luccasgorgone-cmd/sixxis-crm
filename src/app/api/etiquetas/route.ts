// Lista as etiquetas disponiveis (para o popover de etiquetas e filtros).
// ?finalidade=VENDA|POS_VENDA filtra para etiquetas daquela finalidade ou
// "Ambas" (finalidade null). Sem o parametro, retorna todas.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const f = req.nextUrl.searchParams.get("finalidade");
  const filtroFinalidade =
    f === Finalidade.VENDA || f === Finalidade.POS_VENDA
      ? { OR: [{ finalidade: f }, { finalidade: null }] }
      : {};
  const etiquetas = await prisma.etiqueta.findMany({
    where: filtroFinalidade,
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, cor: true, finalidade: true },
  });
  return NextResponse.json({ etiquetas });
}

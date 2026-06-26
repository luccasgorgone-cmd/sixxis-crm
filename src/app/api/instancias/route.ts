// Lista as instancias (numeros) de WhatsApp ATIVAS, opcionalmente por finalidade
// (?finalidade=VENDA|POS_VENDA). Usado pelo compositor para escolher por qual
// numero responder dentro da conversa unificada do setor.
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

  const where: { ativo: boolean; finalidade?: Finalidade } = { ativo: true };
  const f = req.nextUrl.searchParams.get("finalidade");
  if (f === Finalidade.VENDA || f === Finalidade.POS_VENDA) {
    where.finalidade = f;
  }

  const instancias = await prisma.instanciaWhatsApp.findMany({
    where,
    orderBy: { criadoEm: "asc" },
    select: { id: true, nome: true, numero: true, finalidade: true },
  });

  return NextResponse.json({ instancias });
}

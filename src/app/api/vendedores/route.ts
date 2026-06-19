// Lista agentes ativos da fila (acesso) de uma finalidade, para o seletor de
// transferencia. ?finalidade=VENDA|POS_VENDA filtra por acesso. Sem finalidade,
// retorna todos os nao-admin ativos. Disponivel a qualquer agente logado.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { Papel, Finalidade } from "@/generated/prisma/enums";
import { filtroEquipe } from "@/lib/dono";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const f = req.nextUrl.searchParams.get("finalidade");
  const where =
    f === Finalidade.VENDA || f === Finalidade.POS_VENDA
      ? filtroEquipe(f)
      : { ativo: true, papel: { not: Papel.ADMIN } };

  const vendedores = await prisma.agente.findMany({
    where,
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  return NextResponse.json({ vendedores });
}

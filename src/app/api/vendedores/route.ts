// Lista agentes ativos para o seletor de transferencia. Aceita ?finalidade=
// para filtrar a equipe (VENDA -> VENDEDOR, POS_VENDA -> POS_VENDA). Sem
// finalidade, retorna ambas as equipes. Disponivel a qualquer agente logado.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { Papel, Finalidade } from "@/generated/prisma/enums";
import { papelDaFinalidade } from "@/lib/dono";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const f = req.nextUrl.searchParams.get("finalidade");
  const papel =
    f === Finalidade.VENDA || f === Finalidade.POS_VENDA
      ? [papelDaFinalidade(f)]
      : [Papel.VENDEDOR, Papel.POS_VENDA];

  const vendedores = await prisma.agente.findMany({
    where: { ativo: true, papel: { in: papel } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  return NextResponse.json({ vendedores });
}

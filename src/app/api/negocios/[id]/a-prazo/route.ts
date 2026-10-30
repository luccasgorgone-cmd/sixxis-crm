// POST: marca o negocio como "A Prazo" (recontato agendado em N dias). Move para
// a coluna A Prazo, grava o prazo, aplica a etiqueta azul e cria o Lembrete na
// agenda do dono (aviso 24h antes + no dia). Escopo: admin / dono do negocio /
// dono do cliente na finalidade. So VENDA. Nao envia nada ao cliente.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";
import { marcarAPrazo } from "@/lib/aprazo/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { dias?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const dias = Number(body?.dias);
  if (!Number.isFinite(dias) || dias < 1) {
    return NextResponse.json(
      { erro: "dias deve ser um numero >= 1" },
      { status: 400 },
    );
  }

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      agenteId: true,
      finalidade: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const r = await marcarAPrazo(id, agente.id, dias);
  if ("erro" in r) {
    return NextResponse.json({ erro: r.erro }, { status: 422 });
  }
  return NextResponse.json({ ok: true, prazoContatoAte: r.prazoContatoAte });
}

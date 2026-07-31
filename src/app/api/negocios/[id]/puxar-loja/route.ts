// Ganho > "Puxar do site": devolve os pedidos que a Loja tem para o telefone do
// cliente do negocio, para PRE-PREENCHER a tela de Ganho (nunca confirma nada).
//
// A chave da Loja (STORE_INTERNAL_KEY) e usada AQUI, no servidor — o navegador
// so fala com esta rota e nunca ve a chave.
//
// TRAVA (mesma do cotar-frete): a Loja NUNCA quebra o Ganho. Sem telefone, loja
// off ou erro na chamada => { ok:false, mensagem } com HTTP 200, e o Ganho segue
// manual. Escopo: dono do negocio / dono do cliente na finalidade / admin.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";
import { buscarPedidosPorTelefone } from "@/lib/loja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      agenteId: true,
      finalidade: true,
      lead: { select: { telefone: true, donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });

  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const telefone = (negocio.lead.telefone ?? "").trim();
  if (!telefone) {
    return NextResponse.json({
      ok: false,
      mensagem: "Este cliente nao tem telefone cadastrado.",
      pedidos: [],
    });
  }

  try {
    const pedidos = await buscarPedidosPorTelefone(telefone);
    return NextResponse.json({ ok: true, telefone, pedidos });
  } catch (erro) {
    console.error(
      `[puxar-loja] falha ao consultar a loja: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return NextResponse.json({
      ok: false,
      mensagem: "Nao foi possivel consultar o site agora.",
      pedidos: [],
    });
  }
}

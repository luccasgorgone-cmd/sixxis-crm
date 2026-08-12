// EXCLUIR o card: "isto nao foi venda". Gate: dono do negocio, dono do cliente
// ou admin (mesmo criterio de /encerrar e /reativar).
//
// POR QUE EXISTE: mover um card para Vendido SEMPRE grava um evento de ganho —
// e assim tem que ser, senao uma recompra de verdade nao registraria. So que o
// cliente que volta no pos-venda faz o card reabrir, e refechar em Vendido grava
// OUTRO evento. Como o historico de compras conta EVENTOS, um cliente que
// comprou uma vez aparecia com duas ou tres compras.
//
// A decisao do dono foi nao travar nada no fluxo: quem sabe se aquilo foi venda
// ou so uma duvida e o VENDEDOR, e ele diz isso aqui, depois do fato.
//
// EXCLUIR E DIFERENTE DE ENCERRAR:
//   ENCERRAR (Fatia 10) = "este atendimento acabou". So arquiva. O historico
//   fica intacto, porque a venda aconteceu.
//   EXCLUIR  (Fatia 15-A) = "isto nao foi venda". Arquiva TAMBEM, mas alem disso
//   os eventos de ganho do negocio param de contar como compra do cliente.
//
// COMO OS GANHOS PARAM DE CONTAR: mesma mecanica do dedup (Fatia 9) —
// valorGanho vira null e a descricao ganha um marcador. lib/compras ignora quem
// tem marcador, entao a compra some da LISTA e da CONTAGEM do cliente. O evento
// continua inteiro na linha do tempo, dito e datado: nada e deletado.
//
// FATURAMENTO NAO MUDA. Carteira, metas, dashboard e oracle somam Negocio.valor
// (e valorAjustado); o unico leitor de HistoricoNegocio.valorGanho e lib/compras.
// Um card excluido continua somando no faturamento pelo valor do negocio — se o
// dono quiser que "nao foi venda" tambem tire do faturamento, e outra decisao,
// e ela nao esta tomada aqui.
//
// SEM TRAVA NENHUMA PARA O FUTURO: se o cliente voltar a falar, o card
// desarquiva normal, como no Encerrar. So nao ressuscita os eventos antigos.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import {
  arquivarNegociosEConversas,
  ARQUIVO_EXCLUIDO,
} from "@/lib/arquivamento";
import {
  SUFIXO_GANHO_EXCLUIDO,
  ehGanhoDesconsiderado,
} from "@/lib/compras";
import {
  TipoHistorico,
  AtividadeTipo,
  Finalidade,
} from "@/generated/prisma/enums";

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

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      leadId: true,
      agenteId: true,
      finalidade: true,
      arquivado: true,
      vezesGanho: true,
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

  const quem = agente.nome ?? "colaborador";

  // Os ganhos que AINDA contam. Os ja marcados (por dedup ou por uma exclusao
  // anterior) ficam de fora — e isso e o que torna a rota idempotente.
  const eventos = await prisma.historicoNegocio.findMany({
    where: { negocioId: id, tipo: TipoHistorico.GANHO },
    select: { id: true, descricao: true },
  });
  const aNeutralizar = eventos.filter((e) => !ehGanhoDesconsiderado(e.descricao));

  let ganhosNeutralizados = 0;
  await prisma.$transaction(async (tx) => {
    // Um a um porque o marcador e ACRESCENTADO ao texto de cada evento, nao
    // substitui. Sao poucas linhas por negocio.
    for (const e of aNeutralizar) {
      await tx.historicoNegocio.update({
        where: { id: e.id },
        data: {
          valorGanho: null,
          descricao: `${e.descricao}${SUFIXO_GANHO_EXCLUIDO}`,
        },
      });
      ganhosNeutralizados++;
    }

    // CONTADOR: sem nenhum ganho valendo, o negocio nao foi ganho vez nenhuma.
    // Clamp para nunca AUMENTAR — a mesma direcao do dedup: limpeza so desinfla.
    const restantes = eventos.length - aNeutralizar.length;
    const novo = Math.min(restantes, negocio.vezesGanho);
    if (novo !== negocio.vezesGanho) {
      await tx.negocio.update({
        where: { id },
        data: { vezesGanho: novo },
      });
    }

    // Rastro na linha do tempo. NOTA, nunca GANHO/PERDA: excluir nao e desfecho.
    await tx.historicoNegocio.create({
      data: {
        negocioId: id,
        agenteId: agente.id,
        tipo: TipoHistorico.NOTA,
        descricao: `Card excluido por ${quem} — nao foi venda${
          ganhosNeutralizados > 0
            ? ` (${ganhosNeutralizados} ${ganhosNeutralizados === 1 ? "ganho deixou" : "ganhos deixaram"} de contar como compra)`
            : ""
        }`,
      },
    });
  });

  // Arquiva Negocio + Conversa no mesmo passo, com a origem EXCLUIDO. Fora da
  // transacao porque a mecanica compartilhada tem a sua propria — e ela e
  // idempotente: um negocio ja arquivado nao e reescrito.
  const r = await arquivarNegociosEConversas({ id }, ARQUIVO_EXCLUIDO);

  // Espelha na linha do tempo do cliente, como o reativar faz.
  try {
    await prisma.atividade.create({
      data: {
        leadId: negocio.leadId,
        negocioId: id,
        agenteId: agente.id,
        tipo: AtividadeTipo.NOTA,
        descricao: `Card excluido por ${quem} — nao foi venda`,
      },
    });
  } catch {
    // Rastro e best-effort: o card ja saiu do quadro.
  }

  console.log(
    `[excluir] negocio ${id} excluido por ${quem} — ` +
      `${ganhosNeutralizados} ganho(s) fora do historico de compras, ` +
      `${r.total} negocio(s) e ${r.conversas} conversa(s) arquivados — ` +
      "nada deletado, faturamento inalterado",
  );

  return NextResponse.json({
    ok: true,
    ganhosNeutralizados,
    jaEstavaArquivado: negocio.arquivado,
  });
}

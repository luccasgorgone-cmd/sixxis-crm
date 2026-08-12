// ENCERRAR o card: arquivamento manual NEUTRO, em um clique. Gate: dono do
// negocio, dono do cliente ou admin (mesmo criterio de /reativar, o inverso
// desta acao).
//
// POR QUE EXISTE: um cliente que ja comprou sai do quadro pelo prazo, volta a
// falar por um assunto pontual (atraso, duvida, garantia) e o negocio REABRE
// como ABERTO. O vendedor precisa tirar esse card da tela — mas ele nao e venda
// nem perda. Forcar GANHO inventaria uma venda (e dispararia a conversao do
// Meta); forcar PERDIDO inventaria uma perda e sujaria a analise de motivos.
// Encerrar e o terceiro caminho: so ARQUIVA.
//
// O QUE NAO TOCA — e o coracao desta rota:
//   status, fechadoEm, tipoGanho, motivoPerda, valor, vezesGanho, vezesPerdido.
// Se o negocio esta ABERTO continua ABERTO; se esta GANHO continua GANHO. Nao
// entra na carteira como venda nova, nao entra na analise de perdas, nao mexe em
// contador nenhum.
//
// META CAPI NAO DISPARA, por construcao e nao por acaso: dispararPurchase vive
// dentro do PATCH /api/negocios/[id], atras de `if (data.status === GANHO)`.
// Esta rota e outro arquivo, nao importa metaCapi e nao escreve status — nao ha
// caminho daqui ate o Meta.
//
// COMO SAI DA TELA: reusa arquivarNegociosEConversas, a mesma mecanica do job de
// prazo, que arquiva o Negocio E a Conversa do mesmo lead+finalidade no mesmo
// passo (respeitando o indice unico parcial da Conversa). O card some do Kanban
// e do Inbox juntos. Se o cliente voltar a falar, a mecanica que ja existe
// reabre os dois — encerrar nao poe trava nenhuma no futuro.
//
// ZERO DELETE: historico, ganho anterior, compras, orcamentos e pagamentos
// continuam inteiros. "Encerrado" e um booleano, nao uma remocao.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import {
  arquivarNegociosEConversas,
  ARQUIVO_MANUAL,
} from "@/lib/arquivamento";
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
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }

  // Gate identico ao de /reativar: admin / dono do negocio / dono do cliente na
  // finalidade. Nao ha filtro por status — encerrar vale para QUALQUER card.
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // IDEMPOTENTE. Ja arquivado (pelo prazo ou por outro clique) = nada a fazer:
  // devolve sucesso sem escrever. Nao re-marca como MANUAL de proposito — se o
  // prazo tirou o card, quem o tirou foi o prazo, e reescrever a origem apagaria
  // a informacao que a coluna existe para guardar.
  if (negocio.arquivado) {
    return NextResponse.json({ ok: true, jaEncerrado: true });
  }

  // Arquiva Negocio + Conversa no mesmo passo, marcando a origem MANUAL. O
  // `where` por id nao filtra status: encerrar nao e um desfecho, e uma saida de
  // tela — e o unico ponto do sistema que arquiva um negocio ABERTO, de
  // proposito e so quando o vendedor pede.
  const r = await arquivarNegociosEConversas({ id }, ARQUIVO_MANUAL);

  // Corrida: alguem arquivou entre a leitura e o update. Sucesso mesmo assim —
  // o card esta fora do quadro, que era o pedido.
  if (r.total === 0) {
    return NextResponse.json({ ok: true, jaEncerrado: true });
  }

  const quem = agente.nome ?? "colaborador";
  // Rastreabilidade em dois lugares, como o resto do sistema faz: a linha do
  // negocio (HistoricoNegocio) e a linha do cliente (Atividade). Tipo NOTA — nao
  // e ETAPA porque nenhuma etapa mudou, e nao e GANHO/PERDA porque nao houve
  // desfecho. Best-effort: o card ja saiu do quadro, e falhar em registrar o
  // rastro nao pode desfazer isso nem devolver erro ao vendedor.
  try {
    await prisma.$transaction([
      prisma.historicoNegocio.create({
        data: {
          negocioId: id,
          agenteId: agente.id,
          tipo: TipoHistorico.NOTA,
          descricao: `Atendimento encerrado manualmente por ${quem} (sem desfecho de venda)`,
        },
      }),
      prisma.atividade.create({
        data: {
          leadId: negocio.leadId,
          negocioId: id,
          agenteId: agente.id,
          tipo: AtividadeTipo.NOTA,
          descricao: `Atendimento encerrado manualmente por ${quem}`,
        },
      }),
    ]);
  } catch (erro) {
    console.warn(
      `[encerrar] negocio ${id} arquivado, mas falhou ao registrar o rastro: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }

  console.log(
    `[encerrar] negocio ${id} encerrado manualmente por ${quem} ` +
      `(${r.conversas} conversa(s) fora do Inbox) — status inalterado, nada deletado`,
  );

  return NextResponse.json({ ok: true, jaEncerrado: false });
}

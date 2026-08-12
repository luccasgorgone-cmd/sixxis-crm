// Admin: LIMPEZA PONTUAL dos GANHOS REPETIDOS do mesmo negocio. Roda quando o
// dono aciona — nao e job, nao roda no boot nem no deploy.
//
// POR QUE EXISTE: marcar ganho -> reabrir -> marcar ganho de novo deixa um evento
// HistoricoNegocio tipo GANHO a cada passada. Movimentar o card algumas vezes no
// mesmo dia vira "4 compras" no historico do cliente (Fatia 7) e infla o contador
// vezesGanho — quando houve UMA venda. Caso medido: 4 ganhos do mesmo negocio em
// ~2h, mesmo item, ~R$ 2.950 cada.
//
// O QUE NAO MUDA: esta rota NAO poe trava nenhuma no fluxo de marcar ganho. Se o
// cliente comprar de novo amanha, registra normal — e por isso a deduplicacao e
// por PROXIMIDADE no tempo, e nao "todo negocio so pode ter um ganho".
//
// CRITERIO (o numero que o dono valida): eventos GANHO do mesmo negocio dentro
// de JANELA_HORAS a partir do PRIMEIRO evento do ciclo sao o MESMO ciclo de
// venda. O primeiro fica; os seguintes sao repeticao de movimentacao.
//
// A janela conta do PRIMEIRO evento do ciclo, nao do anterior. Encadear pelo
// anterior deixaria uma corrente longa colapsar sem limite (um ganho a cada 20h
// por um mes viraria uma compra so). Ancorada no primeiro, um ciclo cobre no
// maximo JANELA_HORAS — e uma recompra de verdade, que vem dias depois, abre
// ciclo novo e continua contando como compra.
//
// O QUE FAZ em cada negocio com ciclo de 2+:
//   MANTIDO  = o evento mais antigo do ciclo (a venda real). NAO e tocado.
//   OS DEMAIS= valorGanho -> null e sufixo SUFIXO_GANHO_DUPLICADO na descricao.
//              lib/compras ignora quem tem o sufixo, entao eles saem do total E
//              da contagem do historico de compras. O evento continua inteiro na
//              linha do tempo do negocio, e o valor original segue legivel no
//              proprio texto ("Negocio ganho (R$ 2.950,00)") — nada se perde.
//   vezesGanho = numero de ciclos restantes, e SO PARA MENOS (ver clamp abaixo).
//
// ZERO DELETE: nada e apagado — nem evento, nem negocio, nem lead, nem conversa,
// nem pagamento. O STATUS ATUAL do negocio nao e tocado: aberto continua aberto,
// ganho continua ganho. A limpeza e sobre o HISTORICO, nao sobre o estado.
//
// FATURAMENTO NAO MUDA: carteira, metas e oracle somam Negocio.valor por
// status=GANHO e nunca leem HistoricoNegocio.valorGanho — o unico leitor desse
// campo e lib/compras (o historico de compras do cliente).
//
// GET  = PREVIA: so le e lista, nao escreve nada.
// POST = executa, uma transacao POR NEGOCIO. IDEMPOTENTE: os ja marcados sao
//        excluidos da deteccao, entao rodar de novo nao acha mais nada.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import {
  SUFIXO_GANHO_DUPLICADO,
  ehGanhoDesconsiderado,
} from "@/lib/compras";
import {
  JANELA_HORAS,
  CRITERIO_DEDUP,
  agruparEmCiclos,
  vezesGanhoCorrigido,
} from "@/lib/dedupGanhos";
import { TipoHistorico } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// So os eventos que AINDA contam: os ja marcados por uma execucao anterior ficam
// de fora, e e isso que torna a rota idempotente.
function buscarEventos(negocioIds: string[]) {
  return prisma.historicoNegocio.findMany({
    where: {
      tipo: TipoHistorico.GANHO,
      negocioId: { in: negocioIds },
      NOT: { descricao: { endsWith: SUFIXO_GANHO_DUPLICADO } },
    },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      negocioId: true,
      criadoEm: true,
      valorGanho: true,
      descricao: true,
    },
  });
}

type EventoGanho = Awaited<ReturnType<typeof buscarEventos>>[number];

type EventoRelato = {
  id: string;
  data: string;
  valor: number | null;
};

type NegocioAfetado = {
  negocioId: string;
  leadId: string;
  cliente: string;
  finalidade: string;
  // Status atual — mostrado so para o dono conferir que ele NAO muda.
  status: string;
  // Quantos eventos GANHO o negocio tinha antes desta limpeza (ja sem os
  // marcados por execucoes anteriores).
  ganhosAntes: number;
  // Ciclos de venda reais depois de agrupar por proximidade.
  ciclos: number;
  // Um mantido por ciclo (o mais antigo de cada um).
  mantidos: EventoRelato[];
  neutralizados: EventoRelato[];
  vezesGanhoAntes: number;
  vezesGanhoDepois: number;
};

function numeroOuNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function relatar(e: EventoGanho): EventoRelato {
  return {
    id: e.id,
    data: e.criadoEm.toISOString(),
    valor: numeroOuNull(e.valorGanho),
  };
}

// Levanta os negocios com ganhos repetidos (leitura pura). Mesma funcao na
// previa e na execucao — o que o dono ve no GET e o que o POST faz.
async function levantar(): Promise<NegocioAfetado[]> {
  // 1) Negocios com 2+ eventos GANHO que ainda contam.
  const grupos = await prisma.historicoNegocio.groupBy({
    by: ["negocioId"],
    where: {
      tipo: TipoHistorico.GANHO,
      NOT: { descricao: { endsWith: SUFIXO_GANHO_DUPLICADO } },
    },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  if (grupos.length === 0) return [];

  const negocioIds = grupos.map((g) => g.negocioId);

  // 2) Os eventos e os negocios envolvidos.
  const [eventos, negocios] = await Promise.all([
    buscarEventos(negocioIds),
    prisma.negocio.findMany({
      where: { id: { in: negocioIds } },
      select: {
        id: true,
        leadId: true,
        status: true,
        finalidade: true,
        vezesGanho: true,
        lead: {
          select: {
            nome: true,
            pushName: true,
            nomeManual: true,
            telefone: true,
          },
        },
      },
    }),
  ]);

  const porNegocio = new Map<string, EventoGanho[]>();
  for (const e of eventos) {
    const lista = porNegocio.get(e.negocioId);
    if (lista) lista.push(e);
    else porNegocio.set(e.negocioId, [e]);
  }

  const afetados: NegocioAfetado[] = [];
  for (const n of negocios) {
    const lista = porNegocio.get(n.id) ?? [];
    if (lista.length < 2) continue;
    const ciclos = agruparEmCiclos(lista);
    const repetidos = ciclos.flatMap((c) => c.repetidos);
    // Ganhos distantes entre si = vendas distintas. Nada a fazer: o negocio tem
    // 2+ ganhos, mas nenhum deles e repeticao de movimentacao.
    if (repetidos.length === 0) continue;

    afetados.push({
      negocioId: n.id,
      leadId: n.leadId,
      cliente: nomeEfetivo(n.lead),
      finalidade: n.finalidade,
      status: n.status,
      ganhosAntes: lista.length,
      ciclos: ciclos.length,
      mantidos: ciclos.map((c) => relatar(c.mantido)),
      neutralizados: repetidos.map(relatar),
      vezesGanhoAntes: n.vezesGanho,
      vezesGanhoDepois: vezesGanhoCorrigido(ciclos.length, n.vezesGanho),
    });
  }
  return afetados;
}

// Nome distinto de `negocios` (a LISTA) de proposito: as duas coisas viajam no
// mesmo objeto de resposta, e um spread com a chave repetida apagaria a lista.
function totais(afetados: NegocioAfetado[]) {
  return {
    totalNegocios: afetados.length,
    eventosNeutralizados: afetados.reduce(
      (s, a) => s + a.neutralizados.length,
      0,
    ),
    contadoresCorrigidos: afetados.filter(
      (a) => a.vezesGanhoDepois !== a.vezesGanhoAntes,
    ).length,
  };
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const afetados = await levantar();
  return NextResponse.json({
    previa: {
      criterio: CRITERIO_DEDUP,
      janelaHoras: JANELA_HORAS,
      negocios: afetados,
      ...totais(afetados),
    },
    executado: false,
  });
}

export async function POST(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  try {
    const afetados = await levantar();
    const aplicados: NegocioAfetado[] = [];
    const pulados: { negocioId: string; motivo: string }[] = [];

    for (const a of afetados) {
      const resultado = await prisma.$transaction(async (tx) => {
        // Rele DENTRO da transacao e reagrupa: se alguem marcou um ganho novo
        // entre a leitura e agora, quem manda e o estado de agora.
        const atuais = await tx.historicoNegocio.findMany({
          where: {
            tipo: TipoHistorico.GANHO,
            negocioId: a.negocioId,
            NOT: { descricao: { endsWith: SUFIXO_GANHO_DUPLICADO } },
          },
          orderBy: { criadoEm: "asc" },
          select: {
            id: true,
            negocioId: true,
            criadoEm: true,
            valorGanho: true,
            descricao: true,
          },
        });
        const ciclos = agruparEmCiclos(atuais);
        const repetidos = ciclos.flatMap((c) => c.repetidos);
        if (repetidos.length === 0) {
          return { pulado: "sem repetidos na releitura", neutralizados: 0 };
        }

        // Um a um porque a descricao de cada evento e diferente (o sufixo e
        // ACRESCENTADO ao texto original, nao substitui). Sao poucas linhas.
        for (const e of repetidos) {
          // Cinto e suspensorio: se ja tem o sufixo, nao duplica.
          if (ehGanhoDesconsiderado(e.descricao)) continue;
          await tx.historicoNegocio.update({
            where: { id: e.id },
            data: {
              valorGanho: null,
              descricao: `${e.descricao}${SUFIXO_GANHO_DUPLICADO}`,
            },
          });
        }

        // Contador: recalculado sobre os ciclos desta releitura, sempre para
        // menos. O status do negocio NAO entra no update — de proposito.
        const neg = await tx.negocio.findUnique({
          where: { id: a.negocioId },
          select: { vezesGanho: true },
        });
        const depois = vezesGanhoCorrigido(ciclos.length, neg?.vezesGanho ?? 0);
        if (neg && depois !== neg.vezesGanho) {
          await tx.negocio.update({
            where: { id: a.negocioId },
            data: { vezesGanho: depois },
          });
        }

        return { pulado: null as string | null, neutralizados: repetidos.length };
      });

      if (resultado.pulado) {
        pulados.push({ negocioId: a.negocioId, motivo: resultado.pulado });
        continue;
      }
      aplicados.push(a);
    }

    const t = totais(aplicados);
    console.log(
      `[dedup-ganhos] ${t.totalNegocios} negocios limpos, ` +
        `${t.eventosNeutralizados} ganhos repetidos desconsiderados ` +
        `(valorGanho=null + marcador na descricao), ` +
        `${t.contadoresCorrigidos} contadores vezesGanho corrigidos, ` +
        `janela de ${JANELA_HORAS}h, ${pulados.length} pulados — ` +
        `por ${admin.nome ?? admin.id} — nada foi deletado, ` +
        `status dos negocios inalterado`,
    );

    return NextResponse.json({
      executado: true,
      criterio: CRITERIO_DEDUP,
      janelaHoras: JANELA_HORAS,
      negocios: aplicados,
      ...t,
      pulados,
    });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao deduplicar ganhos",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}

// Admin: COLAPSAR compras repetidas do mesmo negocio no historico do cliente.
// Roda quando o dono aciona — nao e job, nao roda no boot.
//
// O QUE ISTO PEGA QUE O DEDUP NAO PEGA: /api/admin/dedup-ganhos junta ganhos do
// mesmo CICLO, dentro de 6h — movimentacao do card para frente e para tras no
// mesmo dia. Aqui o caso e outro: o cliente volta no pos-venda DIAS depois, o
// card reabre, o vendedor refecha em Vendido e nasce mais um evento de ganho. Um
// por dia, muito alem de qualquer janela. Por isso esta rota NAO tem janela — e
// e exatamente essa a diferenca entre as duas, que continuam separadas de
// proposito: o dedup segue com as 6h dele, intocado.
//
// A REGRA QUE AUTORIZA ISSO e uma constatacao do dono, nao uma lei do sistema:
// NENHUM cliente foi recorrente ate agora, entao um negocio de VENDA com 2+
// ganhos validos e erro, nao recompra. E por isso que esta rota e PONTUAL e vive
// atras de um clique do admin, em vez de virar automatismo: no dia em que
// existir recompra de verdade no mesmo negocio, rodar isto passaria a apagar
// venda boa.
//
// QUAL FICA: o de MENOR valorGanho (decisao do dono — refechar o card costuma
// inflar o valor, entao o menor e o mais proximo da venda real). Valores iguais
// ou empatados: o mais ANTIGO, que e a venda original. Evento sem valor nunca e
// escolhido quando ha um com valor: manter o sem valor deixaria a compra do
// cliente como "valor nao registrado" tendo um numero disponivel ao lado.
//
// COMO OS OUTROS SAEM: mesma mecanica do dedup — valorGanho=null + marcador na
// descricao — para lib/compras ignora-los na LISTA e na CONTAGEM. ZERO DELETE:
// o evento continua inteiro na linha do tempo, dito e datado.
//
// FATURAMENTO NAO MUDA. Carteira, metas, dashboard e oracle somam Negocio.valor
// e valorAjustado; o unico leitor de HistoricoNegocio.valorGanho e lib/compras.
// O valor do CARD nao e tocado por esta rota em lugar nenhum.
//
// GET  = PREVIA: so le e lista. POST = executa, uma transacao POR NEGOCIO.
// IDEMPOTENTE: os marcados saem da deteccao, entao a segunda passada nao acha
// mais nada.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import {
  SUFIXO_GANHO_DUPLICADO,
  WHERE_GANHO_VALIDO,
  ehGanhoDesconsiderado,
} from "@/lib/compras";
import { vezesGanhoCorrigido } from "@/lib/dedupGanhos";
import { TipoHistorico, Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventoRelato = { id: string; data: string; valor: number | null };

type NegocioAfetado = {
  negocioId: string;
  leadId: string;
  cliente: string;
  status: string;
  ganhosValidos: number;
  mantido: EventoRelato;
  motivoDoMantido: string;
  neutralizados: EventoRelato[];
  vezesGanhoAntes: number;
  vezesGanhoDepois: number;
};

function numeroOuNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Evento = { id: string; criadoEm: Date; valorGanho: unknown; descricao: string };

function relatar(e: Evento): EventoRelato {
  return {
    id: e.id,
    data: e.criadoEm.toISOString(),
    valor: numeroOuNull(e.valorGanho),
  };
}

// Escolhe qual evento FICA. Comparador TOTAL (nunca devolve 0 para eventos
// diferentes), para a previa e a execucao escolherem sempre exatamente o mesmo.
function escolherMantido(eventos: Evento[]): { escolhido: Evento; motivo: string } {
  const ordenados = [...eventos].sort((a, b) => {
    const va = numeroOuNull(a.valorGanho);
    const vb = numeroOuNull(b.valorGanho);
    // Sem valor vai por ultimo: manter o sem valor deixaria a compra como
    // "valor nao registrado" tendo um numero disponivel ao lado.
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    if (va != null && vb != null && Math.abs(va - vb) > 0.005) return va - vb;
    // Empate no valor (ou ambos sem valor): o mais ANTIGO e a venda original.
    const t = a.criadoEm.getTime() - b.criadoEm.getTime();
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
  const escolhido = ordenados[0];
  const valores = eventos.map((e) => numeroOuNull(e.valorGanho));
  const distintos = new Set(valores.map((v) => (v == null ? "null" : v.toFixed(2))));
  return {
    escolhido,
    motivo:
      distintos.size > 1
        ? "menor valor entre os ganhos do negocio"
        : "valores iguais — ficou o mais antigo",
  };
}

// Levanta os negocios com compras repetidas (leitura pura). Mesma funcao na
// previa e na execucao — o que o dono ve no GET e o que o POST faz.
async function levantar(): Promise<NegocioAfetado[]> {
  // 1) Negocios de VENDA com 2+ ganhos que AINDA valem.
  const grupos = await prisma.historicoNegocio.groupBy({
    by: ["negocioId"],
    where: {
      tipo: TipoHistorico.GANHO,
      negocio: { finalidade: Finalidade.VENDA },
      ...WHERE_GANHO_VALIDO,
    },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  if (grupos.length === 0) return [];

  const negocioIds = grupos.map((g) => g.negocioId);
  const [eventos, negocios] = await Promise.all([
    prisma.historicoNegocio.findMany({
      where: {
        tipo: TipoHistorico.GANHO,
        negocioId: { in: negocioIds },
        ...WHERE_GANHO_VALIDO,
      },
      orderBy: { criadoEm: "asc" },
      select: { id: true, negocioId: true, criadoEm: true, valorGanho: true, descricao: true },
    }),
    prisma.negocio.findMany({
      where: { id: { in: negocioIds } },
      select: {
        id: true,
        leadId: true,
        status: true,
        vezesGanho: true,
        lead: {
          select: { nome: true, pushName: true, nomeManual: true, telefone: true },
        },
      },
    }),
  ]);

  const porNegocio = new Map<string, Evento[]>();
  for (const e of eventos) {
    const lista = porNegocio.get(e.negocioId);
    if (lista) lista.push(e);
    else porNegocio.set(e.negocioId, [e]);
  }

  const afetados: NegocioAfetado[] = [];
  for (const n of negocios) {
    const lista = porNegocio.get(n.id) ?? [];
    if (lista.length < 2) continue;
    const { escolhido, motivo } = escolherMantido(lista);
    const resto = lista.filter((e) => e.id !== escolhido.id);
    afetados.push({
      negocioId: n.id,
      leadId: n.leadId,
      cliente: nomeEfetivo(n.lead),
      status: n.status,
      ganhosValidos: lista.length,
      mantido: relatar(escolhido),
      motivoDoMantido: motivo,
      neutralizados: resto.map(relatar),
      vezesGanhoAntes: n.vezesGanho,
      // Sobra UMA compra por negocio; clamp para so desinflar.
      vezesGanhoDepois: vezesGanhoCorrigido(1, n.vezesGanho),
    });
  }
  return afetados;
}

function totais(afetados: NegocioAfetado[]) {
  return {
    totalNegocios: afetados.length,
    comprasRemovidas: afetados.reduce((s, a) => s + a.neutralizados.length, 0),
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
    executado: false,
    criterio:
      "negocio de VENDA com 2+ ganhos validos, SEM janela de tempo; fica o de menor valor (empate: o mais antigo)",
    previa: { negocios: afetados, ...totais(afetados) },
    faturamento:
      "inalterado — esta rota so toca HistoricoNegocio.valorGanho, lido apenas pelo historico de compras",
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
        // Rele DENTRO da transacao e reescolhe: se um ganho novo entrou entre a
        // leitura e agora, quem manda e o estado de agora.
        const atuais = await tx.historicoNegocio.findMany({
          where: {
            tipo: TipoHistorico.GANHO,
            negocioId: a.negocioId,
            ...WHERE_GANHO_VALIDO,
          },
          orderBy: { criadoEm: "asc" },
          select: { id: true, criadoEm: true, valorGanho: true, descricao: true },
        });
        if (atuais.length < 2) {
          return { pulado: "sem repetidos na releitura", removidas: 0 };
        }
        const { escolhido } = escolherMantido(atuais);
        const resto = atuais.filter((e) => e.id !== escolhido.id);

        // Um a um porque o marcador e ACRESCENTADO ao texto de cada evento.
        for (const e of resto) {
          if (ehGanhoDesconsiderado(e.descricao)) continue;
          await tx.historicoNegocio.update({
            where: { id: e.id },
            data: {
              valorGanho: null,
              descricao: `${e.descricao}${SUFIXO_GANHO_DUPLICADO}`,
            },
          });
        }

        const neg = await tx.negocio.findUnique({
          where: { id: a.negocioId },
          select: { vezesGanho: true },
        });
        const depois = vezesGanhoCorrigido(1, neg?.vezesGanho ?? 0);
        if (neg && depois !== neg.vezesGanho) {
          await tx.negocio.update({
            where: { id: a.negocioId },
            data: { vezesGanho: depois },
          });
        }
        return { pulado: null as string | null, removidas: resto.length };
      });

      if (resultado.pulado) {
        pulados.push({ negocioId: a.negocioId, motivo: resultado.pulado });
        continue;
      }
      aplicados.push(a);
    }

    const t = totais(aplicados);
    console.log(
      `[limpar-compras-duplicadas] ${t.totalNegocios} negocios colapsados para 1 compra, ` +
        `${t.comprasRemovidas} compras repetidas desconsideradas, ` +
        `${t.contadoresCorrigidos} contadores corrigidos, ` +
        `${pulados.length} pulados — por ${admin.nome ?? admin.id} — ` +
        "nada deletado, faturamento e valor do card inalterados",
    );

    return NextResponse.json({
      executado: true,
      negocios: aplicados,
      ...t,
      pulados,
      faturamento: "inalterado",
    });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao limpar compras duplicadas",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}

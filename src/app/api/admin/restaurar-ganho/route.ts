// Admin: RESTAURAR o status GANHO de vendas confirmadas que viraram ABERTO.
// Correcao PONTUAL e NOMINAL — age so nos negocios que quem chama nomeia.
//
// POR QUE EXISTE: quando o cliente volta a mandar mensagem, garantirNegocioParaLead
// reabre o negocio (GANHO -> ABERTO) para o atendimento acontecer. Isso esta
// certo. O problema e o que veio depois: o card foi movido para uma etapa de
// negociacao e ficou ABERTO. Como carteira e metas contam faturamento por
// status=GANHO, essas vendas — que aconteceram de verdade — sumiram do numero.
//
// O GANHO NAO E RECRIADO, E REUSADO. Nada aqui incrementa vezesGanho, cria
// evento HistoricoNegocio tipo GANHO, grava valorGanho novo ou chama o Meta.
// Recriar o ganho produziria exatamente a inflacao que a Fatia 9 existe para
// desfazer, e uma conversao falsa no Meta. O valor tambem nao e tocado: ele
// nunca saiu do negocio.
//
// TRAVA CONTRA INVENTAR FATURAMENTO: so restaura quem TEM ganho comprovado
// (jaFoiGanho ou evento GANHO que ainda vale no historico). Quem nao tem e
// PULADO e reportado, para o dono olhar a mao. Marcar GANHO onde nunca houve
// venda seria criar faturamento do nada — o oposto do que esta fatia faz.
//
// A LISTA VEM POR PARAMETRO, nao esta no codigo. Nome e telefone de cliente
// gravados no repositorio ficariam no historico do git para sempre; alem disso,
// uma rota parametrizada serve a proxima correcao sem precisar de deploy.
//   ?telefones=11999999999,21988888888   (casa em todas as variantes)
//   ?negocioIds=abc,def                  (direto, para desempatar ambiguidade)
// O POST tambem aceita { telefones: [], negocioIds: [] } no corpo.
//
// AMBIGUIDADE NAO E RESOLVIDA NO CHUTE: se um telefone casar com mais de um
// negocio de venda (lead duplicado, ou um arquivado + um ativo), o item e PULADO
// com os candidatos listados. O dono reexecuta com o negocioId certo. Escolher
// sozinho seria adivinhar em cima de faturamento.
//
// GET  = PREVIA: so le e diz o que faria. Nao escreve nada.
// POST = executa, uma transacao POR NEGOCIO. IDEMPOTENTE: quem ja esta GANHO e
//        pulado, entao rodar de novo nao muda nada.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { desarquivarConversaDoLead } from "@/lib/arquivamento";
import { ehGanhoDesconsiderado } from "@/lib/compras";
import {
  buscarNegociosVendaPorTelefone,
  temGanhoComprovado,
  type NegocioPorTelefone,
} from "@/lib/buscaNegocioTelefone";
import {
  StatusNeg,
  TipoEtapa,
  TipoHistorico,
  Finalidade,
  FinalidadeEtapa,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTA_RESTAURO =
  "Status de ganho restaurado (venda confirmada) — sem novo evento de ganho";

type Decisao =
  | "restaurar"
  | "ja_era_ganho"
  | "sem_ganho_no_historico"
  | "nao_encontrado"
  | "ambiguo";

type ItemPlano = {
  // O que foi pedido (telefone ou id), para o relatorio casar com a lista.
  pedido: string;
  decisao: Decisao;
  negocioId: string | null;
  cliente: string | null;
  telefone: string | null;
  statusAtual: string | null;
  etapaAtual: string | null;
  valor: number | null;
  arquivado: boolean;
  jaFoiGanho: boolean;
  ganhosNoHistorico: number;
  // Data que sera usada em fechadoEm, e de onde ela veio.
  fechadoEmPrevisto: string | null;
  origemFechadoEm: string | null;
  // Preenchido so quando decisao = "ambiguo".
  candidatos?: { negocioId: string; status: string; arquivado: boolean }[];
};

function lista(bruto: string | null | undefined): string[] {
  if (!bruto) return [];
  return bruto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// De onde sai o fechadoEm do ganho restaurado. NUNCA "agora": a venda aconteceu
// no passado, e carimbar hoje moveria faturamento de mes — justamente o tipo de
// distorcao que esta fatia veio corrigir. So cai em agora se nao houver nenhuma
// data no registro, o que na pratica nao acontece em quem tem ganho comprovado.
function resolverFechadoEm(n: {
  ultimoGanhoEm: string | null;
  ultimoGanhoHistoricoEm: string | null;
  fechadoEmAtual: string | null;
}): { data: string; origem: string } {
  if (n.ultimoGanhoEm) return { data: n.ultimoGanhoEm, origem: "ultimoGanhoEm" };
  if (n.ultimoGanhoHistoricoEm) {
    return { data: n.ultimoGanhoHistoricoEm, origem: "historico GANHO" };
  }
  if (n.fechadoEmAtual) {
    return { data: n.fechadoEmAtual, origem: "fechadoEm atual" };
  }
  return { data: new Date().toISOString(), origem: "agora (sem data no registro)" };
}

function planoDoNegocio(
  pedido: string,
  n: NegocioPorTelefone,
  fechadoEmAtual: string | null,
): ItemPlano {
  const base = {
    pedido,
    negocioId: n.negocioId,
    cliente: n.cliente,
    telefone: n.telefone,
    statusAtual: n.status,
    etapaAtual: n.etapa?.nome ?? null,
    valor: n.valor,
    arquivado: n.arquivado,
    jaFoiGanho: n.jaFoiGanho,
    ganhosNoHistorico: n.ganhosNoHistorico,
  };
  if (n.status === StatusNeg.GANHO) {
    return {
      ...base,
      decisao: "ja_era_ganho",
      fechadoEmPrevisto: null,
      origemFechadoEm: null,
    };
  }
  if (!temGanhoComprovado(n)) {
    return {
      ...base,
      decisao: "sem_ganho_no_historico",
      fechadoEmPrevisto: null,
      origemFechadoEm: null,
    };
  }
  const f = resolverFechadoEm({
    ultimoGanhoEm: n.ultimoGanhoEm,
    ultimoGanhoHistoricoEm: n.ultimoGanhoHistoricoEm,
    fechadoEmAtual,
  });
  return {
    ...base,
    decisao: "restaurar",
    fechadoEmPrevisto: f.data,
    origemFechadoEm: f.origem,
  };
}

// Monta o plano (leitura pura). Mesma funcao na previa e na execucao — o que o
// dono ve no GET e o que o POST faz.
async function montarPlano(
  telefones: string[],
  negocioIds: string[],
): Promise<ItemPlano[]> {
  const itens: ItemPlano[] = [];

  // fechadoEm atual dos negocios citados por id (o telefone ja traz o resto).
  const fechados = new Map<string, string | null>();
  const idsCitados = [...new Set(negocioIds)];
  if (idsCitados.length > 0) {
    const rows = await prisma.negocio.findMany({
      where: { id: { in: idsCitados } },
      select: { id: true, fechadoEm: true },
    });
    for (const r of rows) fechados.set(r.id, r.fechadoEm?.toISOString() ?? null);
  }

  for (const tel of telefones) {
    const candidatos = await buscarNegociosVendaPorTelefone(tel);
    if (candidatos.length === 0) {
      itens.push({
        pedido: tel,
        decisao: "nao_encontrado",
        negocioId: null,
        cliente: null,
        telefone: tel,
        statusAtual: null,
        etapaAtual: null,
        valor: null,
        arquivado: false,
        jaFoiGanho: false,
        ganhosNoHistorico: 0,
        fechadoEmPrevisto: null,
        origemFechadoEm: null,
      });
      continue;
    }
    if (candidatos.length > 1) {
      const c0 = candidatos[0];
      itens.push({
        pedido: tel,
        decisao: "ambiguo",
        negocioId: null,
        cliente: c0.cliente,
        telefone: c0.telefone,
        statusAtual: null,
        etapaAtual: null,
        valor: null,
        arquivado: false,
        jaFoiGanho: false,
        ganhosNoHistorico: 0,
        fechadoEmPrevisto: null,
        origemFechadoEm: null,
        candidatos: candidatos.map((c) => ({
          negocioId: c.negocioId,
          status: c.status,
          arquivado: c.arquivado,
        })),
      });
      continue;
    }
    const unico = candidatos[0];
    const fech = await prisma.negocio.findUnique({
      where: { id: unico.negocioId },
      select: { fechadoEm: true },
    });
    itens.push(
      planoDoNegocio(tel, unico, fech?.fechadoEm?.toISOString() ?? null),
    );
  }

  // Ids diretos: resolvidos pelo telefone do proprio lead, para passarem pelo
  // MESMO caminho de leitura (e a mesma prova de ganho) dos itens por telefone.
  for (const id of idsCitados) {
    const neg = await prisma.negocio.findUnique({
      where: { id },
      select: { id: true, finalidade: true, lead: { select: { telefone: true } } },
    });
    if (!neg || neg.finalidade !== Finalidade.VENDA) {
      itens.push({
        pedido: id,
        decisao: "nao_encontrado",
        negocioId: null,
        cliente: null,
        telefone: null,
        statusAtual: null,
        etapaAtual: null,
        valor: null,
        arquivado: false,
        jaFoiGanho: false,
        ganhosNoHistorico: 0,
        fechadoEmPrevisto: null,
        origemFechadoEm: null,
      });
      continue;
    }
    const candidatos = await buscarNegociosVendaPorTelefone(neg.lead.telefone);
    const alvo = candidatos.find((c) => c.negocioId === id);
    if (!alvo) continue;
    itens.push(planoDoNegocio(id, alvo, fechados.get(id) ?? null));
  }

  return itens;
}

// Etapa "Vendido" da VENDA: a etapa tipo GANHO do funil (menor ordem, ativa).
async function etapaVendido() {
  return prisma.etapa.findFirst({
    where: {
      tipo: TipoEtapa.GANHO,
      ativo: true,
      finalidade: { in: [FinalidadeEtapa.VENDA, FinalidadeEtapa.AMBAS] },
    },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}

function resumir(itens: ItemPlano[]) {
  const aRestaurar = itens.filter((i) => i.decisao === "restaurar");
  return {
    total: itens.length,
    aRestaurar: aRestaurar.length,
    jaEramGanho: itens.filter((i) => i.decisao === "ja_era_ganho").length,
    semGanho: itens.filter((i) => i.decisao === "sem_ganho_no_historico").length,
    naoEncontrados: itens.filter((i) => i.decisao === "nao_encontrado").length,
    ambiguos: itens.filter((i) => i.decisao === "ambiguo").length,
    valorQueVoltaAoFaturamento: aRestaurar.reduce(
      (s, i) => s + (i.valor ?? 0),
      0,
    ),
  };
}

async function lerEntrada(req: NextRequest): Promise<{
  telefones: string[];
  negocioIds: string[];
}> {
  const sp = req.nextUrl.searchParams;
  const telefones = lista(sp.get("telefones"));
  const negocioIds = lista(sp.get("negocioIds"));
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (Array.isArray(body?.telefones)) {
        telefones.push(...body.telefones.map(String));
      }
      if (Array.isArray(body?.negocioIds)) {
        negocioIds.push(...body.negocioIds.map(String));
      }
    } catch {
      // Sem corpo (ou corpo invalido): vale so a query.
    }
  }
  return { telefones: [...new Set(telefones)], negocioIds: [...new Set(negocioIds)] };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { telefones, negocioIds } = await lerEntrada(req);
  if (telefones.length === 0 && negocioIds.length === 0) {
    return NextResponse.json(
      { erro: "informe ?telefones=... e/ou ?negocioIds=..." },
      { status: 400 },
    );
  }
  const itens = await montarPlano(telefones, negocioIds);
  const destino = await etapaVendido();
  return NextResponse.json({
    executado: false,
    etapaDestino: destino?.nome ?? null,
    previa: { itens, ...resumir(itens) },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { telefones, negocioIds } = await lerEntrada(req);
  if (telefones.length === 0 && negocioIds.length === 0) {
    return NextResponse.json(
      { erro: "informe telefones e/ou negocioIds" },
      { status: 400 },
    );
  }

  try {
    const destino = await etapaVendido();
    if (!destino) {
      return NextResponse.json(
        { erro: "funil de venda sem etapa de ganho (Vendido)" },
        { status: 422 },
      );
    }

    const itens = await montarPlano(telefones, negocioIds);
    const aplicados: ItemPlano[] = [];
    const pulados: ItemPlano[] = [];
    // Leads cujo negocio saiu do arquivo: a conversa volta ao Inbox junto.
    const desarquivar: string[] = [];

    for (const item of itens) {
      if (item.decisao !== "restaurar" || !item.negocioId) {
        pulados.push(item);
        continue;
      }
      const negocioId = item.negocioId;

      const feito = await prisma.$transaction(async (tx) => {
        // Rele DENTRO da transacao: entre a previa e agora alguem pode ter
        // fechado o negocio na mao. O estado de agora e que manda.
        const atual = await tx.negocio.findUnique({
          where: { id: negocioId },
          select: {
            status: true,
            jaFoiGanho: true,
            arquivado: true,
            leadId: true,
            finalidade: true,
          },
        });
        if (!atual || atual.finalidade !== Finalidade.VENDA) return false;
        if (atual.status === StatusNeg.GANHO) return false;

        // Reconfere a prova de ganho aqui dentro. A previa ja checou, mas quem
        // escreve faturamento nao confia em leitura de dois segundos atras.
        const eventos = await tx.historicoNegocio.findMany({
          where: { negocioId, tipo: TipoHistorico.GANHO },
          select: { descricao: true },
        });
        const ganhosValidos = eventos.filter(
          (e) => !ehGanhoDesconsiderado(e.descricao),
        ).length;
        if (!atual.jaFoiGanho && ganhosValidos === 0) return false;

        await tx.negocio.update({
          where: { id: negocioId },
          data: {
            status: StatusNeg.GANHO,
            etapaId: destino.id,
            entrouEtapaEm: new Date(),
            // Data do ganho ORIGINAL — nunca hoje: carimbar agora moveria a
            // venda de mes no relatorio.
            fechadoEm: item.fechadoEmPrevisto
              ? new Date(item.fechadoEmPrevisto)
              : undefined,
            // Volta ao quadro em Vendido (o dono quer ver o card la).
            arquivado: false,
            arquivadoEm: null,
            arquivadoMotivo: null,
            // NADA de vezesGanho, valor, tipoGanho ou evento GANHO novo. A nota
            // e tipo NOTA de proposito: rastro, nao desfecho — nao infla o
            // historico de compras nem o contador.
            historicos: {
              create: {
                tipo: TipoHistorico.NOTA,
                descricao: NOTA_RESTAURO,
                agenteId: admin.id,
              },
            },
          },
        });
        if (atual.arquivado) desarquivar.push(atual.leadId);
        return true;
      });

      if (feito) aplicados.push(item);
      else {
        // Mudou entre a previa e a execucao: nao e erro, e o mundo andando.
        pulados.push({ ...item, decisao: "ja_era_ganho" });
      }
    }

    // Conversa de volta ao Inbox para quem estava arquivado. Best-effort, fora
    // da transacao (a propria funcao ja e defensiva).
    for (const leadId of [...new Set(desarquivar)]) {
      await desarquivarConversaDoLead(leadId, Finalidade.VENDA);
    }

    const resumo = resumir(aplicados);
    console.log(
      `[restaurar-ganho] ${aplicados.length} vendas restauradas para GANHO em "${destino.nome}", ` +
        `R$ ${resumo.valorQueVoltaAoFaturamento.toFixed(2)} de volta ao faturamento, ` +
        `${pulados.length} pulados — por ${admin.nome ?? admin.id} — ` +
        "ganho reusado (sem evento novo, sem contador, sem Meta), nada deletado",
    );

    return NextResponse.json({
      executado: true,
      etapaDestino: destino.nome,
      restaurados: aplicados,
      pulados,
      ...resumo,
      totalPulados: pulados.length,
    });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao restaurar ganhos",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}

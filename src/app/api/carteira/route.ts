// Carteira de um colaborador numa finalidade, com FILTRO DE PERIODO. Distingue
// claramente o que e "no periodo" (ganhos/perdidos/valor/conversao/tempo) do que
// e "atual" (em aberto/pendentes/clientes/etiquetas). Respeita dono + finalidade
// + papel.
//
// GET /api/carteira?finalidade=VENDA|POS_VENDA[&agenteId=(admin)]
//                  [&periodo=hoje|semana|15d|mes][&inicio=&fim=]
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { campoDono, temAcesso } from "@/lib/dono";
import { nomeEfetivo } from "@/lib/cliente";
import { fimDoDia } from "@/lib/lembrete";
import { calcularMetricas, resolverPeriodo } from "@/lib/metricas";
import { analisarPerdidos } from "@/lib/perdidos";
import {
  Finalidade,
  StatusLembrete,
  StatusNeg,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const selectCliente = {
  id: true,
  nome: true,
  pushName: true,
  nomeManual: true,
  telefone: true,
  fotoUrl: true,
  etiquetas: { include: { etiqueta: true } },
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);
  const sp = req.nextUrl.searchParams;

  const f = sp.get("finalidade");
  if (f !== Finalidade.VENDA && f !== Finalidade.POS_VENDA) {
    return NextResponse.json({ erro: "finalidade invalida" }, { status: 400 });
  }
  const finalidade = f;

  const paramAgente = sp.get("agenteId");
  const alvoId = admin && paramAgente ? paramAgente : agente.id;

  const alvo = await prisma.agente.findUnique({
    where: { id: alvoId },
    select: { id: true, nome: true, acessoVenda: true, acessoPosVenda: true },
  });
  if (!alvo) {
    return NextResponse.json({ erro: "colaborador nao encontrado" }, { status: 404 });
  }
  if (!temAcesso(alvo, finalidade)) {
    return NextResponse.json(
      { erro: "colaborador sem acesso a essa finalidade" },
      { status: 422 },
    );
  }

  // Periodo (default: 30 dias).
  const preset = sp.get("periodo") ?? "mes";
  const { inicio, fim } = resolverPeriodo(
    preset,
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );

  const campo = campoDono(finalidade);

  // Portfolio ATUAL (todos os negocios da finalidade do colaborador) — para
  // em aberto, pendentes, clientes, etiquetas e a lista com busca.
  const [portfolio, totalClientes, etiquetasValidas, ganhosPeriodo, perdidos, metricas, lembretes] =
    await Promise.all([
      prisma.negocio.findMany({
        where: { finalidade, lead: { [campo]: alvoId } },
        orderBy: { atualizadoEm: "desc" },
        select: {
          id: true,
          status: true,
          valor: true,
          pendente: true,
          motivoPendencia: true,
          lead: { select: selectCliente },
        },
      }),
      prisma.lead.count({ where: { [campo]: alvoId } }),
      prisma.etiqueta.findMany({
        where: { OR: [{ finalidade }, { finalidade: null }] },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, cor: true },
      }),
      // Ganhos NO PERIODO (por fechadoEm).
      prisma.negocio.findMany({
        where: {
          finalidade,
          lead: { [campo]: alvoId },
          status: StatusNeg.GANHO,
          fechadoEm: { gte: inicio, lte: fim },
        },
        orderBy: { fechadoEm: "desc" },
        select: {
          id: true,
          valor: true,
          fechadoEm: true,
          lead: { select: selectCliente },
        },
      }),
      analisarPerdidos({ finalidade, alvoId, inicio, fim }),
      // Conversa/mensagens do periodo (clientes atendidos, 1a resposta) — mesmo
      // motor do dashboard.
      calcularMetricas({ inicio, fim }, { agenteId: alvoId, finalidade }),
      prisma.lembrete.findMany({
        where: {
          agenteId: alvoId,
          finalidade,
          status: StatusLembrete.PENDENTE,
          dataHora: { lte: fimDoDia() },
        },
        orderBy: { dataHora: "asc" },
        select: {
          id: true,
          negocioId: true,
          dataHora: true,
          nota: true,
          lead: { select: selectCliente },
        },
      }),
    ]);

  function mapItem(n: {
    id: string;
    status?: StatusNeg;
    valor: unknown;
    pendente?: boolean;
    motivoPendencia?: string | null;
    fechadoEm?: Date | null;
    lead: {
      id: string;
      nome: string | null;
      pushName: string | null;
      nomeManual: string | null;
      telefone: string;
      fotoUrl: string | null;
      etiquetas: { etiqueta: { id: string; nome: string; cor: string } }[];
    };
  }) {
    return {
      negocioId: n.id,
      leadId: n.lead.id,
      nomeEfetivo: nomeEfetivo(n.lead),
      telefone: n.lead.telefone,
      fotoUrl: n.lead.fotoUrl,
      valor: n.valor != null ? Number(n.valor) : null,
      status: n.status ?? null,
      pendente: n.pendente ?? false,
      motivoPendencia: n.motivoPendencia ?? null,
      fechadoEm: n.fechadoEm ?? null,
      etiquetas: n.lead.etiquetas.map((le) => ({
        id: le.etiqueta.id,
        nome: le.etiqueta.nome,
        cor: le.etiqueta.cor,
      })),
    };
  }

  const itens = portfolio.map(mapItem);
  const abertos = itens.filter((i) => i.status === "ABERTO");
  const pendentesLista = itens.filter((i) => i.pendente);
  const ganhosLista = ganhosPeriodo.map(mapItem);
  const valorGanhos = ganhosLista.reduce((s, g) => s + (g.valor ?? 0), 0);

  // Contagem por etiqueta (clientes distintos), so etiquetas validas.
  const validas = new Map(etiquetasValidas.map((e) => [e.id, e]));
  const leadsPorEtiqueta = new Map<string, Set<string>>();
  for (const i of itens) {
    for (const et of i.etiquetas) {
      if (!validas.has(et.id)) continue;
      const set = leadsPorEtiqueta.get(et.id) ?? new Set<string>();
      set.add(i.leadId);
      leadsPorEtiqueta.set(et.id, set);
    }
  }
  const etiquetas = etiquetasValidas
    .map((e) => ({
      id: e.id,
      nome: e.nome,
      cor: e.cor,
      count: leadsPorEtiqueta.get(e.id)?.size ?? 0,
    }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  const ganhosCount = ganhosLista.length;
  const conversao =
    ganhosCount + perdidos.total > 0
      ? ganhosCount / (ganhosCount + perdidos.total)
      : 0;
  const ticketMedio = ganhosCount > 0 ? valorGanhos / ganhosCount : 0;

  const aContatar = lembretes.map((l) => ({
    id: l.id,
    negocioId: l.negocioId,
    leadId: l.lead.id,
    nomeEfetivo: nomeEfetivo(l.lead),
    telefone: l.lead.telefone,
    fotoUrl: l.lead.fotoUrl,
    dataHora: l.dataHora,
    nota: l.nota,
    vencido: l.dataHora.getTime() < Date.now(),
  }));

  return NextResponse.json({
    finalidade,
    agente: { id: alvo.id, nome: alvo.nome },
    periodo: { preset, inicio, fim },
    kpis: {
      // atual
      abertos: abertos.length,
      pendentes: pendentesLista.length,
      totalClientes,
      // periodo
      ganhos: ganhosCount,
      valorGanhos,
      perdidos: perdidos.total,
      valorPerdidos: perdidos.valorTotal,
      conversao,
      ticketMedio,
      clientesAtendidos: metricas.clientesAtendidos,
      tempoPrimeiraRespostaSeg: metricas.tempoPrimeiraRespostaSeg,
    },
    etiquetas,
    itens,
    abertos,
    pendentesLista,
    ganhosPeriodo: ganhosLista,
    perdidos,
    aContatar,
  });
}

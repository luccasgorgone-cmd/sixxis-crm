// Admin: PREVIA COMPARATIVA do faturamento — regra ANTIGA vs regra NOVA
// (Fatia 14), lado a lado, por vendedor e no total, com a lista dos negocios que
// DIFEREM. Somente leitura: nao escreve nada, nao roda no boot.
//
// PARA QUE SERVE: a Fatia 14 muda o numero que o dono ve. Esta rota existe para
// ele conferir a mudanca ANTES de confiar nela — e depois, a qualquer momento,
// para responder "por que o faturamento subiu?" com nome, valor e data de cada
// venda que entrou.
//
//   ANTIGA = status GANHO agora E fechadoEm no periodo.
//   NOVA   = houve ganho cuja data cai no periodo (ver lib/vendasPeriodo).
//
// A diferenca sao, na esmagadora maioria, VENDAS REABERTAS: o cliente voltou a
// falar, o negocio virou ABERTO e o fechadoEm foi zerado, entao a venda sumia do
// numero mesmo tendo acontecido.
//
// A NOVA CONTEM A ANTIGA por construcao, entao "soDaAntiga" deve vir vazio. Se
// algum dia vier com algo, e sinal de dado estranho (um negocio GANHO com
// fechadoEm no periodo mas sem nenhuma memoria de ganho) e merece olhar — por
// isso e reportado em vez de escondido.
//
// GET /api/admin/previa-faturamento?periodo=hoje|semana|15d|mes[&inicio=&fim=]
//                                  [&finalidade=VENDA|POS_VENDA]
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { campoDono } from "@/lib/dono";
import { nomeEfetivo } from "@/lib/cliente";
import { resolverPeriodo } from "@/lib/metricas";
import { ehDuplicadoNeutralizado } from "@/lib/motivosPerda";
import {
  whereVendaNoPeriodo,
  whereVendaNoPeriodoAntigo,
  dataDaVenda,
} from "@/lib/vendasPeriodo";
import { Finalidade } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const selectVenda = {
  id: true,
  status: true,
  valor: true,
  finalidade: true,
  fechadoEm: true,
  ultimoGanhoEm: true,
  jaFoiGanho: true,
  // Para a auditoria enxergar POR QUE um negocio PERDIDO esta entrando: se e um
  // duplicado neutralizado (nao deveria entrar) ou uma perda de verdade depois
  // de uma venda de verdade (entra, e o dono decide se concorda).
  motivoPerda: true,
  motivoPerdaObs: true,
  etapa: { select: { nome: true } },
  lead: {
    select: {
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      donoId: true,
      donoPosVendaId: true,
    },
  },
} satisfies Prisma.NegocioSelect;

type NegocioVenda = Prisma.NegocioGetPayload<{ select: typeof selectVenda }>;

function numeroOuNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type LinhaVendedor = {
  agenteId: string | null;
  nome: string;
  antigoQtd: number;
  antigoValor: number;
  novoQtd: number;
  novoValor: number;
  // O que a regra nova acrescenta para este vendedor.
  diferencaQtd: number;
  diferencaValor: number;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const { inicio, fim } = resolverPeriodo(
    sp.get("periodo"),
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );

  const f = sp.get("finalidade");
  const escopo: Prisma.NegocioWhereInput =
    f === Finalidade.VENDA || f === Finalidade.POS_VENDA
      ? { finalidade: f }
      : {};

  const janela = { inicio, fim };
  const [antigos, novos] = await Promise.all([
    prisma.negocio.findMany({
      where: { AND: [escopo, whereVendaNoPeriodoAntigo(janela)] },
      select: selectVenda,
    }),
    prisma.negocio.findMany({
      where: { AND: [escopo, whereVendaNoPeriodo(janela)] },
      select: selectVenda,
    }),
  ]);

  const idsAntigos = new Set(antigos.map((n) => n.id));
  const idsNovos = new Set(novos.map((n) => n.id));
  // Entram a mais com a regra nova: as vendas que estavam sumidas.
  const soDaNova = novos.filter((n) => !idsAntigos.has(n.id));
  // Deveria ser vazio (a nova contem a antiga). Reportado, nao escondido.
  const soDaAntiga = antigos.filter((n) => !idsNovos.has(n.id));

  // Vendedor = dono do LEAD na finalidade, o mesmo criterio da carteira.
  const donoDe = (n: NegocioVenda) => n.lead[campoDono(n.finalidade)];

  const porVendedor = new Map<
    string,
    { antigoQtd: number; antigoValor: number; novoQtd: number; novoValor: number }
  >();
  const zero = () => ({
    antigoQtd: 0,
    antigoValor: 0,
    novoQtd: 0,
    novoValor: 0,
  });
  for (const n of antigos) {
    const k = donoDe(n) ?? "";
    const a = porVendedor.get(k) ?? zero();
    a.antigoQtd++;
    a.antigoValor += numeroOuNull(n.valor) ?? 0;
    porVendedor.set(k, a);
  }
  for (const n of novos) {
    const k = donoDe(n) ?? "";
    const a = porVendedor.get(k) ?? zero();
    a.novoQtd++;
    a.novoValor += numeroOuNull(n.valor) ?? 0;
    porVendedor.set(k, a);
  }

  const ids = [...porVendedor.keys()].filter(Boolean);
  const agentes = ids.length
    ? await prisma.agente.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true },
      })
    : [];
  const nomes = new Map(agentes.map((a) => [a.id, a.nome]));

  const linhas: LinhaVendedor[] = [...porVendedor.entries()]
    .map(([id, v]) => ({
      agenteId: id || null,
      nome: id ? (nomes.get(id) ?? "(colaborador removido)") : "(sem dono)",
      ...v,
      diferencaQtd: v.novoQtd - v.antigoQtd,
      diferencaValor: v.novoValor - v.antigoValor,
    }))
    // Maior diferenca primeiro: e o que o dono abriu a previa para entender.
    .sort((a, b) => b.diferencaValor - a.diferencaValor);

  const soma = (lista: NegocioVenda[]) =>
    lista.reduce((s, n) => s + (numeroOuNull(n.valor) ?? 0), 0);

  const detalhe = (n: NegocioVenda) => {
    const d = dataDaVenda(n);
    return {
      negocioId: n.id,
      cliente: nomeEfetivo(n.lead),
      telefone: n.lead.telefone,
      finalidade: n.finalidade,
      valor: numeroOuNull(n.valor),
      statusAtual: n.status,
      etapaAtual: n.etapa?.nome ?? null,
      dataDaVenda: d ? d.toISOString() : null,
      // Por que a regra antiga perdia esta venda.
      motivo:
        n.status !== "GANHO"
          ? `reaberto: status atual ${n.status}${n.fechadoEm ? "" : " e fechadoEm zerado"}`
          : "fechadoEm fora do periodo (ou ausente), mas o ganho e do periodo",
      // Um PERDIDO entrando merece olhar. Estes dois campos dizem qual dos dois
      // casos e: duplicado neutralizado (nao deve entrar — se aparecer, e bug)
      // ou perda real depois de venda real (entra; a venda aconteceu).
      motivoPerda: n.motivoPerda,
      duplicadoNeutralizado: ehDuplicadoNeutralizado(n),
    };
  };

  return NextResponse.json({
    periodo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
    finalidade: f ?? "todas",
    antiga: { qtd: antigos.length, valor: soma(antigos) },
    nova: { qtd: novos.length, valor: soma(novos) },
    diferenca: {
      qtd: novos.length - antigos.length,
      valor: soma(novos) - soma(antigos),
    },
    porVendedor: linhas,
    // As vendas que a regra nova recupera — com nome, valor, data e o porque.
    entramNaNova: soDaNova.map(detalhe),
    // Esperado: vazio. Ver o cabecalho.
    saemDaAntiga: soDaAntiga.map(detalhe),
    observacao:
      "A regra nova contem a antiga: nenhuma venda que ja contava deixa de contar. " +
      "A diferenca sao vendas reais cujo negocio foi reaberto no pos-venda e que a " +
      "regra antiga perdia. Cada uma conta UMA vez, na data do ganho.",
  });
}

// Detalhe de uma meta para a pagina /metas/[id] (GET) + edicao/exclusao das
// PROPRIAS metas pelo colaborador (PATCH/DELETE com gate de propriedade).
// Admin tambem passa pelo gate (podeEditarMeta retorna true para admin).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import { calcularMetricas } from "@/lib/metricas";
import { analisarPerdidosWhere } from "@/lib/perdidos";
import {
  calcularProgresso,
  podeEditarMeta,
  metaSeAplica,
  whereNegociosMeta,
  type MetaBase,
} from "@/lib/metas";
import {
  Finalidade,
  StatusNeg,
  MetricaMeta,
  PeriodoMeta,
  FinalidadeEtapa,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ehEnum<T extends Record<string, string>>(
  e: T,
  v: unknown,
): v is T[keyof T] {
  return typeof v === "string" && Object.values(e).includes(v);
}

const DIA_MS = 24 * 60 * 60 * 1000;
const selectCliente = {
  id: true,
  nome: true,
  pushName: true,
  nomeManual: true,
  telefone: true,
  fotoUrl: true,
} as const;

type LeadSel = {
  id: string;
  nome: string | null;
  pushName: string | null;
  nomeManual: string | null;
  telefone: string;
  fotoUrl: string | null;
};

function mapItem(n: {
  id: string;
  valor: Prisma.Decimal | null;
  fechadoEm: Date | null;
  motivoPendencia: string | null;
  lead: LeadSel;
}) {
  return {
    negocioId: n.id,
    leadId: n.lead.id,
    nome: nomeEfetivo(n.lead),
    telefone: n.lead.telefone,
    fotoUrl: n.lead.fotoUrl,
    valor: n.valor != null ? Number(n.valor) : null,
    fechadoEm: n.fechadoEm,
    motivoPendencia: n.motivoPendencia,
  };
}

// Serie acumulada (ganhos por dia) para metricas de fechamento.
function montarSerie(
  metrica: MetricaMeta,
  inicio: Date,
  fim: Date,
  alvo: number,
  ganhos: { fechadoEm: Date | null; valor: number | null }[],
): { dia: string; acumulado: number; alvo: number }[] {
  if (metrica !== MetricaMeta.VALOR_VENDIDO && metrica !== MetricaMeta.QTD_GANHOS) {
    return [];
  }
  const totalDias = Math.ceil((fim.getTime() - inicio.getTime()) / DIA_MS);
  const passo = totalDias > 92 ? Math.ceil(totalDias / 92) : 1;
  const incremento = (g: { valor: number | null }) =>
    metrica === MetricaMeta.VALOR_VENDIDO ? (g.valor ?? 0) : 1;

  const serie: { dia: string; acumulado: number; alvo: number }[] = [];
  let acumulado = 0;
  let idx = 0;
  const ordenados = [...ganhos]
    .filter((g) => g.fechadoEm)
    .sort((a, b) => a.fechadoEm!.getTime() - b.fechadoEm!.getTime());

  for (let d = 0; d <= totalDias; d += passo) {
    const limite = new Date(inicio.getTime() + d * DIA_MS);
    while (idx < ordenados.length && ordenados[idx].fechadoEm! <= limite) {
      acumulado += incremento(ordenados[idx]);
      idx++;
    }
    serie.push({
      dia: limite.toISOString().slice(0, 10),
      acumulado,
      alvo,
    });
  }
  return serie;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const meta = await prisma.meta.findUnique({
    where: { id },
    include: {
      agente: { select: { id: true, nome: true } },
      criadoPor: { select: { id: true, nome: true } },
    },
  });
  if (!meta) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }

  const eu = await prisma.agente.findUnique({
    where: { id: agente.id },
    select: { acessoVenda: true, acessoPosVenda: true },
  });
  const acesso = {
    acessoVenda: eu?.acessoVenda ?? false,
    acessoPosVenda: eu?.acessoPosVenda ?? false,
  };
  if (!metaSeAplica(agente, meta, acesso)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const agora = new Date();
  const progresso = await calcularProgresso(meta as MetaBase, agora);

  // Escopo de metricas (para metricas que nao sao de fechamento).
  const fin =
    meta.finalidade === "AMBAS" ? undefined : (meta.finalidade as Finalidade);
  const escopo =
    meta.escopo === "COLABORADOR" && meta.agenteId
      ? { agenteId: meta.agenteId, finalidade: fin }
      : { finalidade: fin };
  const metricas = await calcularMetricas(
    { inicio: meta.inicio, fim: meta.fim },
    escopo,
  );

  const base = whereNegociosMeta(meta);

  // Drill-downs: ganhos/perdidos no periodo (por fechadoEm); abertos/pendentes
  // pelo estado atual.
  const [ganhos, abertos, pendentes, perdidos] = await Promise.all([
    prisma.negocio.findMany({
      where: {
        AND: [
          base,
          {
            status: StatusNeg.GANHO,
            fechadoEm: { gte: meta.inicio, lte: meta.fim },
          },
        ],
      },
      orderBy: { fechadoEm: "desc" },
      select: {
        id: true,
        valor: true,
        fechadoEm: true,
        motivoPendencia: true,
        lead: { select: selectCliente },
      },
    }),
    prisma.negocio.findMany({
      where: { AND: [base, { status: StatusNeg.ABERTO }] },
      orderBy: { atualizadoEm: "desc" },
      take: 200,
      select: {
        id: true,
        valor: true,
        fechadoEm: true,
        motivoPendencia: true,
        lead: { select: selectCliente },
      },
    }),
    prisma.negocio.findMany({
      where: { AND: [base, { pendente: true }] },
      orderBy: { atualizadoEm: "desc" },
      take: 200,
      select: {
        id: true,
        valor: true,
        fechadoEm: true,
        motivoPendencia: true,
        lead: { select: selectCliente },
      },
    }),
    analisarPerdidosWhere(base, { inicio: meta.inicio, fim: meta.fim }),
  ]);

  const serie = montarSerie(
    meta.metrica,
    meta.inicio,
    meta.fim,
    meta.alvo,
    ganhos.map((g) => ({
      fechadoEm: g.fechadoEm,
      valor: g.valor != null ? Number(g.valor) : null,
    })),
  );

  return NextResponse.json({
    meta: {
      id: meta.id,
      nome: meta.nome,
      escopo: meta.escopo,
      agente: meta.agente,
      criadoPorId: meta.criadoPorId,
      criadoPor: meta.criadoPor,
      finalidade: meta.finalidade,
      metrica: meta.metrica,
      alvo: meta.alvo,
      periodo: meta.periodo,
      inicio: meta.inicio,
      fim: meta.fim,
      ativo: meta.ativo,
      podeEditar: podeEditarMeta(agente, meta),
    },
    progresso,
    metricas,
    serie,
    ganhos: ganhos.map(mapItem),
    abertos: abertos.map(mapItem),
    pendentes: pendentes.map(mapItem),
    perdidos,
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const meta = await prisma.meta.findUnique({
    where: { id },
    select: { id: true, escopo: true, agenteId: true, criadoPorId: true },
  });
  if (!meta) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (!podeEditarMeta(agente, meta)) {
    return NextResponse.json(
      { erro: "voce so pode editar as proprias metas" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Prisma.MetaUncheckedUpdateInput = {};
  if (body.nome !== undefined) {
    data.nome =
      typeof body.nome === "string" && body.nome.trim() ? body.nome.trim() : null;
  }
  if (body.finalidade !== undefined) {
    if (!ehEnum(FinalidadeEtapa, body.finalidade)) {
      return NextResponse.json({ erro: "finalidade invalida" }, { status: 400 });
    }
    data.finalidade = body.finalidade;
  }
  if (body.metrica !== undefined) {
    if (!ehEnum(MetricaMeta, body.metrica)) {
      return NextResponse.json({ erro: "metrica invalida" }, { status: 400 });
    }
    data.metrica = body.metrica;
  }
  if (body.periodo !== undefined) {
    if (!ehEnum(PeriodoMeta, body.periodo)) {
      return NextResponse.json({ erro: "periodo invalido" }, { status: 400 });
    }
    data.periodo = body.periodo;
  }
  if (body.alvo !== undefined) {
    const alvo = Number(body.alvo);
    if (!Number.isFinite(alvo) || alvo <= 0) {
      return NextResponse.json(
        { erro: "alvo deve ser maior que zero" },
        { status: 400 },
      );
    }
    data.alvo = alvo;
  }
  if (body.inicio !== undefined) {
    const inicio = new Date(String(body.inicio));
    if (Number.isNaN(inicio.getTime())) {
      return NextResponse.json({ erro: "inicio invalido" }, { status: 400 });
    }
    data.inicio = inicio;
  }
  if (body.fim !== undefined) {
    const fim = new Date(String(body.fim));
    if (Number.isNaN(fim.getTime())) {
      return NextResponse.json({ erro: "fim invalido" }, { status: 400 });
    }
    data.fim = fim;
  }
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);

  const atualizada = await prisma.meta.update({ where: { id }, data });
  if (atualizada.fim.getTime() <= atualizada.inicio.getTime()) {
    return NextResponse.json(
      { erro: "o fim deve ser depois do inicio" },
      { status: 400 },
    );
  }
  const progresso = await calcularProgresso(atualizada as MetaBase);
  return NextResponse.json({ meta: { ...atualizada, progresso, podeEditar: true } });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const meta = await prisma.meta.findUnique({
    where: { id },
    select: { id: true, escopo: true, agenteId: true, criadoPorId: true },
  });
  if (!meta) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (!podeEditarMeta(agente, meta)) {
    return NextResponse.json(
      { erro: "voce so pode excluir as proprias metas" },
      { status: 403 },
    );
  }
  await prisma.meta.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

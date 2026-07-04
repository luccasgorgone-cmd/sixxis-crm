// Aba LOCAL (pos-venda): produtos em assistencia. GET lista (com filtros +
// resumo por status) e POST cadastra. Permissao: ADMIN e POS_VENDA. Entidade
// isolada — nao entra em metricas de venda.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, podePosVenda } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { nomeEfetivo, selectClienteBasico } from "@/lib/cliente";
import { resolverPeriodo } from "@/lib/metricas";
import { StatusAssistencia } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALIDOS = new Set<string>(Object.values(StatusAssistencia));

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!podePosVenda(agente)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;

  // Filtros base (sem status) — o resumo por status usa esta base.
  const base: Prisma.ItemLocalWhereInput = {};
  const categoria = sp.get("categoria")?.trim();
  if (categoria) base.categoria = { equals: categoria, mode: "insensitive" };
  const q = sp.get("busca")?.trim();
  if (q) {
    const dig = q.replace(/\D/g, "");
    base.OR = [
      { descricaoProduto: { contains: q, mode: "insensitive" } },
      { modelo: { contains: q, mode: "insensitive" } },
      { numeroSerie: { contains: q, mode: "insensitive" } },
      { lead: { nome: { contains: q, mode: "insensitive" } } },
      { lead: { pushName: { contains: q, mode: "insensitive" } } },
      { lead: { nomeManual: { contains: q, mode: "insensitive" } } },
      ...(dig ? [{ lead: { telefone: { contains: dig } } }] : []),
    ];
  }
  const periodo = sp.get("periodo");
  if (periodo) {
    const { inicio, fim } = resolverPeriodo(periodo, null, null, new Date());
    base.dataEntrada = { gte: inicio, lte: fim };
  }

  const status = sp.get("status");
  const where: Prisma.ItemLocalWhereInput =
    status && STATUS_VALIDOS.has(status)
      ? { ...base, status: status as StatusAssistencia }
      : base;

  const [itens, contagens] = await Promise.all([
    prisma.itemLocal.findMany({
      where,
      orderBy: { dataEntrada: "desc" },
      take: 300,
      include: { lead: { select: selectClienteBasico } },
    }),
    prisma.itemLocal.groupBy({
      by: ["status"],
      where: base,
      _count: { _all: true },
    }),
  ]);

  const resumo: Record<string, number> = {};
  for (const c of contagens) resumo[c.status] = c._count._all;

  return NextResponse.json({
    itens: itens.map((it) => ({
      id: it.id,
      descricaoProduto: it.descricaoProduto,
      modelo: it.modelo,
      categoria: it.categoria,
      numeroSerie: it.numeroSerie,
      defeitoRelatado: it.defeitoRelatado,
      status: it.status,
      localizacao: it.localizacao,
      tecnicoResponsavel: it.tecnicoResponsavel,
      observacoes: it.observacoes,
      dataEntrada: it.dataEntrada,
      dataSaida: it.dataSaida,
      leadId: it.leadId,
      leadNome: it.lead ? nomeEfetivo(it.lead) : null,
      leadFoto: it.lead?.fotoUrl ?? null,
    })),
    resumo,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!podePosVenda(agente)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const descricaoProduto = String(body.descricaoProduto ?? "").trim();
  if (!descricaoProduto) {
    return NextResponse.json(
      { erro: "descricao do produto obrigatoria" },
      { status: 400 },
    );
  }
  const statusIn = body.status;
  const status =
    typeof statusIn === "string" && STATUS_VALIDOS.has(statusIn)
      ? (statusIn as StatusAssistencia)
      : StatusAssistencia.RECEBIDO;

  const txt = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s || null;
  };

  const item = await prisma.itemLocal.create({
    data: {
      leadId: txt(body.leadId),
      descricaoProduto,
      modelo: txt(body.modelo),
      categoria: txt(body.categoria),
      numeroSerie: txt(body.numeroSerie),
      defeitoRelatado: txt(body.defeitoRelatado),
      status,
      localizacao: txt(body.localizacao),
      tecnicoResponsavel: txt(body.tecnicoResponsavel),
      observacoes: txt(body.observacoes),
      ...(status === StatusAssistencia.ENTREGUE ? { dataSaida: new Date() } : {}),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: item.id });
}

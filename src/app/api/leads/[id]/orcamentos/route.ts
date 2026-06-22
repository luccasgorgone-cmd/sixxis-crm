// Orcamentos de um cliente: listar (GET) e criar (POST). Multiplos por cliente
// ficam todos armazenados (historico). Gate: dono do cliente (venda/pos), dono da
// conversa ou admin. Leitura segue o mesmo gate (info do cliente).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O agente pode gerenciar este lead? Admin, dono (venda/pos) ou agente de alguma
// conversa do lead.
async function podeGerenciar(
  agente: { id: string; papel: import("@/generated/prisma/enums").Papel },
  leadId: string,
): Promise<boolean> {
  if (ehAdmin(agente.papel)) return true;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      donoId: true,
      donoPosVendaId: true,
      conversas: { select: { agenteId: true } },
    },
  });
  if (!lead) return false;
  return (
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id ||
    lead.conversas.some((c) => c.agenteId === agente.id)
  );
}

async function serializar(
  orcamentos: {
    id: string;
    produto: string;
    valor: import("@/generated/prisma/client").Prisma.Decimal | null;
    voltagem: string | null;
    observacao: string | null;
    negocioId: string | null;
    criadoPorId: string | null;
    criadoEm: Date;
  }[],
) {
  const ids = [
    ...new Set(orcamentos.map((o) => o.criadoPorId).filter(Boolean) as string[]),
  ];
  const autores = ids.length
    ? await prisma.agente.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true },
      })
    : [];
  const nomePor = new Map(autores.map((a) => [a.id, a.nome]));
  return orcamentos.map((o) => ({
    id: o.id,
    produto: o.produto,
    valor: o.valor != null ? Number(o.valor) : null,
    voltagem: o.voltagem,
    observacao: o.observacao,
    negocioId: o.negocioId,
    autor: o.criadoPorId ? (nomePor.get(o.criadoPorId) ?? null) : null,
    criadoEm: o.criadoEm,
  }));
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
  if (!(await podeGerenciar(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const orcamentos = await prisma.orcamento.findMany({
    where: { leadId: id },
    orderBy: { criadoEm: "desc" },
    select: {
      id: true,
      produto: true,
      valor: true,
      voltagem: true,
      observacao: true,
      negocioId: true,
      criadoPorId: true,
      criadoEm: true,
    },
  });
  return NextResponse.json({ orcamentos: await serializar(orcamentos) });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await podeGerenciar(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: {
    produto?: string;
    valor?: number | string | null;
    voltagem?: string | null;
    observacao?: string | null;
    negocioId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const produto = String(body.produto ?? "").trim();
  if (!produto) {
    return NextResponse.json({ erro: "produto obrigatorio" }, { status: 400 });
  }
  let valor: number | null = null;
  if (body.valor !== null && body.valor !== undefined && body.valor !== "") {
    const v = Number(String(body.valor).replace(",", "."));
    valor = Number.isFinite(v) ? v : null;
  }

  const orc = await prisma.orcamento.create({
    data: {
      leadId: id,
      negocioId: body.negocioId ?? null,
      produto,
      valor,
      voltagem: body.voltagem?.trim() || null,
      observacao: body.observacao?.trim() || null,
      criadoPorId: agente.id,
    },
    select: {
      id: true,
      produto: true,
      valor: true,
      voltagem: true,
      observacao: true,
      negocioId: true,
      criadoPorId: true,
      criadoEm: true,
    },
  });
  const [serial] = await serializar([orc]);
  return NextResponse.json({ orcamento: serial });
}

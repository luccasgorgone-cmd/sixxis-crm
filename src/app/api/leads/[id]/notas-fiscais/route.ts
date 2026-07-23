// Notas fiscais de um cliente (Fatia D): listar (GET) e criar (POST). Nivel LEAD
// (visivel em venda e pos-venda). Gate: dono do cliente (venda/pos), dono da
// conversa ou admin (podeGerenciarLead). numero + dataNF obrigatorios; orcamentoId
// opcional DEVE apontar para um orcamento do MESMO lead (validado).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeGerenciarLead } from "@/lib/autorizacao";
import { formatarNumeroPedido } from "@/lib/format";
import { dataSomenteDia } from "@/lib/data";
import { registrarAtividade } from "@/lib/atividade";
import { AtividadeTipo } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await podeGerenciarLead(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const notas = await prisma.notaFiscal.findMany({
    where: { leadId: id },
    orderBy: [{ dataNF: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true,
      numero: true,
      dataNF: true,
      negocioId: true,
      orcamentoId: true,
      criadoEm: true,
      orcamento: { select: { numero: true } },
    },
  });

  return NextResponse.json({
    notas: notas.map((n) => ({
      id: n.id,
      numero: n.numero,
      dataNF: n.dataNF,
      negocioId: n.negocioId,
      orcamentoId: n.orcamentoId,
      orcamentoNumero:
        n.orcamento != null ? formatarNumeroPedido(n.orcamento.numero) : null,
      criadoEm: n.criadoEm,
    })),
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await podeGerenciarLead(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const numero = typeof body.numero === "string" ? body.numero.trim() : "";
  if (!numero) {
    return NextResponse.json({ erro: "Numero da NF e obrigatorio." }, { status: 400 });
  }

  // Data "so dia" ancorada ao meio-dia UTC (nao desloca no fuso BR — a NF e o
  // relogio da garantia). Ponto unico: lib/data.
  const dataNF = dataSomenteDia(body.dataNF as string | null | undefined);
  if (!dataNF) {
    return NextResponse.json({ erro: "Data da NF invalida." }, { status: 400 });
  }

  // Orcamento opcional: se informado, precisa ser do MESMO lead. Deriva o negocioId
  // do proprio orcamento (mais confiavel que o corpo).
  let orcamentoId: string | null = null;
  let negocioId: string | null =
    typeof body.negocioId === "string" && body.negocioId ? body.negocioId : null;
  if (typeof body.orcamentoId === "string" && body.orcamentoId) {
    const orc = await prisma.orcamento.findFirst({
      where: { id: body.orcamentoId, leadId: id },
      select: { id: true, negocioId: true },
    });
    if (!orc) {
      return NextResponse.json(
        { erro: "Orcamento nao encontrado para este cliente." },
        { status: 400 },
      );
    }
    orcamentoId = orc.id;
    negocioId = orc.negocioId ?? negocioId;
  }

  const nota = await prisma.notaFiscal.create({
    data: { leadId: id, negocioId, orcamentoId, numero, dataNF, agenteId: agente.id },
    select: {
      id: true,
      numero: true,
      dataNF: true,
      negocioId: true,
      orcamentoId: true,
      criadoEm: true,
      orcamento: { select: { numero: true } },
    },
  });

  await registrarAtividade({
    leadId: id,
    agenteId: agente.id,
    tipo: AtividadeTipo.ACOMPANHAMENTO,
    descricao: `Nota fiscal ${numero} registrada (por ${agente.nome ?? "colaborador"})`,
  });

  return NextResponse.json({
    nota: {
      id: nota.id,
      numero: nota.numero,
      dataNF: nota.dataNF,
      negocioId: nota.negocioId,
      orcamentoId: nota.orcamentoId,
      orcamentoNumero:
        nota.orcamento != null ? formatarNumeroPedido(nota.orcamento.numero) : null,
      criadoEm: nota.criadoEm,
    },
  });
}

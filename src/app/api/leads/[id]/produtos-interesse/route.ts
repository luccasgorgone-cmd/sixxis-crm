// Produtos de INTERESSE de um cliente (vario por cliente). GET lista os atuais;
// PUT substitui o conjunto (envia a lista de ids ativos desejados). Registra
// Atividade de auditoria quando muda. Dono ou ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { registrarAtividade } from "@/lib/atividade";
import { AtividadeTipo } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const vinculos = await prisma.leadProdutoInteresse.findMany({
    where: { leadId: id },
    select: { produtoInteresse: { select: { id: true, nome: true, ativo: true } } },
  });
  return NextResponse.json({
    produtos: vinculos.map((v) => v.produtoInteresse),
  });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  let body: { produtoIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const desejados = Array.isArray(body.produtoIds)
    ? Array.from(
        new Set(body.produtoIds.filter((x): x is string => typeof x === "string")),
      )
    : [];

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!lead) {
    return NextResponse.json({ erro: "cliente nao encontrado" }, { status: 404 });
  }

  // Conjunto atual.
  const atuais = await prisma.leadProdutoInteresse.findMany({
    where: { leadId: id },
    select: { produtoInteresseId: true },
  });
  const setAtual = new Set(atuais.map((a) => a.produtoInteresseId));
  const setNovo = new Set(desejados);

  const aRemover = [...setAtual].filter((x) => !setNovo.has(x));
  const aAdicionar = [...setNovo].filter((x) => !setAtual.has(x));

  // Valida que os ids a adicionar existem (evita FK invalida).
  let validos = aAdicionar;
  if (aAdicionar.length > 0) {
    const existentes = await prisma.produtoInteresse.findMany({
      where: { id: { in: aAdicionar } },
      select: { id: true },
    });
    validos = existentes.map((e) => e.id);
  }

  if (aRemover.length === 0 && validos.length === 0) {
    return NextResponse.json({ ok: true, semMudanca: true });
  }

  await prisma.$transaction([
    ...(aRemover.length
      ? [
          prisma.leadProdutoInteresse.deleteMany({
            where: { leadId: id, produtoInteresseId: { in: aRemover } },
          }),
        ]
      : []),
    ...validos.map((produtoInteresseId) =>
      prisma.leadProdutoInteresse.create({
        data: { leadId: id, produtoInteresseId },
      }),
    ),
  ]);

  // Auditoria: nomes para a descricao.
  const nomes = await prisma.produtoInteresse.findMany({
    where: { id: { in: [...validos, ...aRemover] } },
    select: { id: true, nome: true },
  });
  const mapaNome = new Map(nomes.map((n) => [n.id, n.nome]));
  const partes: string[] = [];
  if (validos.length) {
    partes.push(`+ ${validos.map((i) => mapaNome.get(i) ?? i).join(", ")}`);
  }
  if (aRemover.length) {
    partes.push(`- ${aRemover.map((i) => mapaNome.get(i) ?? i).join(", ")}`);
  }
  await registrarAtividade({
    leadId: id,
    agenteId: agente.id,
    tipo: AtividadeTipo.EDICAO,
    descricao: `Produtos de interesse atualizados: ${partes.join("; ")}`,
  });

  const vinculos = await prisma.leadProdutoInteresse.findMany({
    where: { leadId: id },
    select: { produtoInteresse: { select: { id: true, nome: true, ativo: true } } },
  });
  return NextResponse.json({
    ok: true,
    produtos: vinculos.map((v) => v.produtoInteresse),
  });
}

// Conversa do Oracle: GET (mensagens cronologicas) e PATCH (renomear). Escopo
// RIGIDO: 404 se a conversa nao for do proprio agente (admin incluso). Fatia 2.93.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

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
  const conversa = await prisma.oracleConversa.findFirst({
    where: { id, agenteId: agente.id },
    select: { id: true, titulo: true },
  });
  if (!conversa) {
    return NextResponse.json({ erro: "conversa nao encontrada" }, { status: 404 });
  }
  const mensagens = await prisma.oracleMensagem.findMany({
    where: { conversaId: id },
    orderBy: { criadoEm: "asc" },
    select: { autor: true, texto: true },
  });
  return NextResponse.json({
    conversa,
    mensagens: mensagens.map((m) => ({
      autor: m.autor === "oracle" ? "oracle" : "user",
      texto: m.texto,
    })),
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
  let body: { titulo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const titulo = String(body.titulo ?? "").trim().slice(0, 80);
  if (!titulo) {
    return NextResponse.json({ erro: "titulo obrigatorio" }, { status: 400 });
  }
  // Escopo: so renomeia se for do proprio agente.
  const res = await prisma.oracleConversa.updateMany({
    where: { id, agenteId: agente.id },
    data: { titulo },
  });
  if (res.count === 0) {
    return NextResponse.json({ erro: "conversa nao encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, titulo });
}

// Comandos salvos (atalhos) do Oracle, PRIVADOS por agente. GET lista; POST cria
// (teto de 30 por agente). Fatia 2.93.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COMANDOS = 30;

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const comandos = await prisma.oracleComando.findMany({
    where: { agenteId: agente.id },
    orderBy: { criadoEm: "desc" },
    select: { id: true, rotulo: true, pergunta: true },
  });
  return NextResponse.json({ comandos });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  let body: { rotulo?: unknown; pergunta?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const rotulo = String(body.rotulo ?? "").trim().slice(0, 40);
  const pergunta = String(body.pergunta ?? "").trim().slice(0, 4000);
  if (!rotulo || !pergunta) {
    return NextResponse.json(
      { erro: "rotulo e pergunta sao obrigatorios" },
      { status: 400 },
    );
  }
  const total = await prisma.oracleComando.count({ where: { agenteId: agente.id } });
  if (total >= MAX_COMANDOS) {
    return NextResponse.json(
      { erro: `limite de ${MAX_COMANDOS} comandos atingido` },
      { status: 422 },
    );
  }
  const comando = await prisma.oracleComando.create({
    data: { agenteId: agente.id, rotulo, pergunta },
    select: { id: true, rotulo: true, pergunta: true },
  });
  return NextResponse.json({ comando });
}

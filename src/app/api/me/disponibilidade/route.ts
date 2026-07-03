// Disponibilidade do PROPRIO usuario: le/altera o SEU Agente.ativo (o MESMO
// campo que o admin controla no painel — sem duplicar). Reflete no roteamento:
// inativo nao recebe novos leads (filtroEquipe exige ativo), mas os leads
// continuam entrando e vao para os colegas ativos. So mexe no proprio agente.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const a = await prisma.agente.findUnique({
    where: { id: agente.id },
    select: { ativo: true },
  });
  return NextResponse.json({ ativo: a?.ativo ?? false });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  let body: { ativo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  if (typeof body.ativo !== "boolean") {
    return NextResponse.json(
      { erro: "campo 'ativo' (booleano) obrigatorio" },
      { status: 400 },
    );
  }
  // SEMPRE o proprio agente (agente.id) — nunca altera outro.
  const atualizado = await prisma.agente.update({
    where: { id: agente.id },
    data: { ativo: body.ativo },
    select: { ativo: true },
  });
  return NextResponse.json({ ativo: atualizado.ativo });
}

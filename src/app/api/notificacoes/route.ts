// Notificacoes do agente logado. GET lista (com contador de nao lidas); PATCH
// marca uma como lida (id) ou todas (todas: true).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const apenasContador = req.nextUrl.searchParams.get("contador") === "1";

  const naoLidas = await prisma.notificacao.count({
    where: { agenteId: agente.id, lida: false },
  });
  if (apenasContador) {
    return NextResponse.json({ naoLidas });
  }

  const notificacoes = await prisma.notificacao.findMany({
    where: { agenteId: agente.id },
    orderBy: [{ lida: "asc" }, { criadoEm: "desc" }],
    take: 50,
  });
  return NextResponse.json({ naoLidas, notificacoes });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  let body: { id?: string; todas?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  if (body.todas) {
    await prisma.notificacao.updateMany({
      where: { agenteId: agente.id, lida: false },
      data: { lida: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    // Escopo pelo agente para nao marcar a notificacao de outra pessoa.
    await prisma.notificacao.updateMany({
      where: { id: body.id, agenteId: agente.id },
      data: { lida: true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
}

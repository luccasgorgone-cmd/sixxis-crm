// Tarefa individual: editar/concluir (PATCH) e excluir (DELETE). Apenas o dono
// (agente da tarefa) age sobre ela.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import { StatusTarefa } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const tarefa = await prisma.tarefa.findUnique({
    where: { id },
    select: { id: true, agenteId: true },
  });
  if (!tarefa) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (tarefa.agenteId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: {
    titulo?: string;
    descricao?: string | null;
    dataHora?: string;
    duracaoMin?: number | null;
    leadId?: string | null;
    lembrarAntesMin?: number | null;
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Prisma.TarefaUncheckedUpdateInput = {};
  const num = (v: unknown): number | null =>
    typeof v === "number" && v > 0 ? Math.floor(v) : null;

  if (body.titulo !== undefined) {
    const t = String(body.titulo).trim();
    if (!t) return NextResponse.json({ erro: "titulo obrigatorio" }, { status: 400 });
    data.titulo = t;
  }
  if (body.descricao !== undefined) data.descricao = body.descricao?.trim() || null;
  if (body.dataHora !== undefined) {
    const d = new Date(body.dataHora);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ erro: "dataHora invalida" }, { status: 400 });
    }
    data.dataHora = d;
    // Reagendou: zera o alerta para poder notificar de novo no novo horario.
    data.notificadoEm = null;
  }
  if (body.duracaoMin !== undefined) data.duracaoMin = num(body.duracaoMin);
  if (body.leadId !== undefined) data.leadId = body.leadId?.trim() || null;
  if (body.lembrarAntesMin !== undefined) {
    data.lembrarAntesMin = num(body.lembrarAntesMin);
    data.notificadoEm = null;
  }
  if (body.status !== undefined) {
    const up = String(body.status).toUpperCase();
    if (up in StatusTarefa) data.status = up as StatusTarefa;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  const tarefaAtualizada = await prisma.tarefa.update({ where: { id }, data });
  getIO()?.emit("tarefa:atualizada", { agenteId: agente.id });
  return NextResponse.json({ tarefa: tarefaAtualizada });
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
  const tarefa = await prisma.tarefa.findUnique({
    where: { id },
    select: { agenteId: true },
  });
  if (!tarefa) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (tarefa.agenteId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  await prisma.tarefa.delete({ where: { id } });
  getIO()?.emit("tarefa:atualizada", { agenteId: agente.id });
  return NextResponse.json({ ok: true });
}

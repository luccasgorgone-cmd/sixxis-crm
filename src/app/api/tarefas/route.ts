// Tarefas/compromissos da agenda do agente logado.
//  - GET ?de=ISO&ate=ISO -> lista as tarefas do agente no intervalo.
//  - POST {titulo, descricao?, dataHora, duracaoMin?, leadId?, lembrarAntesMin?}.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const de = sp.get("de") ? new Date(sp.get("de")!) : null;
  const ate = sp.get("ate") ? new Date(sp.get("ate")!) : null;

  const tarefas = await prisma.tarefa.findMany({
    where: {
      agenteId: agente.id,
      ...(de && !Number.isNaN(de.getTime()) && ate && !Number.isNaN(ate.getTime())
        ? { dataHora: { gte: de, lte: ate } }
        : {}),
    },
    orderBy: { dataHora: "asc" },
    include: {
      lead: {
        select: { nome: true, pushName: true, nomeManual: true, telefone: true },
      },
    },
  });

  return NextResponse.json({
    tarefas: tarefas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      descricao: t.descricao,
      dataHora: t.dataHora,
      duracaoMin: t.duracaoMin,
      leadId: t.leadId,
      cliente: t.lead ? nomeEfetivo(t.lead) : null,
      lembrarAntesMin: t.lembrarAntesMin,
      status: t.status,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  let body: {
    titulo?: string;
    descricao?: string | null;
    dataHora?: string;
    duracaoMin?: number | null;
    leadId?: string | null;
    lembrarAntesMin?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const titulo = String(body.titulo ?? "").trim();
  if (!titulo) {
    return NextResponse.json({ erro: "titulo obrigatorio" }, { status: 400 });
  }
  const dataHora = body.dataHora ? new Date(body.dataHora) : null;
  if (!dataHora || Number.isNaN(dataHora.getTime())) {
    return NextResponse.json({ erro: "dataHora invalida" }, { status: 400 });
  }

  // Cliente opcional: valida existencia quando informado.
  let leadId: string | null = body.leadId?.trim() || null;
  if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) leadId = null;
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && v > 0 ? Math.floor(v) : null;

  const tarefa = await prisma.tarefa.create({
    data: {
      agenteId: agente.id,
      titulo,
      descricao: body.descricao?.trim() || null,
      dataHora,
      duracaoMin: num(body.duracaoMin),
      leadId,
      lembrarAntesMin: num(body.lembrarAntesMin),
    },
  });

  getIO()?.emit("tarefa:atualizada", { agenteId: agente.id });

  return NextResponse.json({ tarefa });
}

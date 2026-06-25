// Agenda unificada do agente: tarefas + lembretes de cliente num intervalo.
// GET ?de=ISO&ate=ISO -> { eventos: [...] } normalizados para o calendario.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type EventoAgenda = {
  id: string;
  tipo: "tarefa" | "lembrete";
  titulo: string;
  descricao: string | null;
  dataHora: string;
  duracaoMin: number | null;
  leadId: string | null;
  negocioId: string | null;
  cliente: string | null;
  finalidade: "VENDA" | "POS_VENDA" | null;
  status: string;
  lembrarAntesMin: number | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const de = sp.get("de") ? new Date(sp.get("de")!) : null;
  const ate = sp.get("ate") ? new Date(sp.get("ate")!) : null;
  if (!de || !ate || Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) {
    return NextResponse.json({ erro: "intervalo invalido" }, { status: 400 });
  }

  const [tarefas, lembretes] = await Promise.all([
    prisma.tarefa.findMany({
      where: { agenteId: agente.id, dataHora: { gte: de, lte: ate } },
      orderBy: { dataHora: "asc" },
      include: {
        lead: {
          select: { nome: true, pushName: true, nomeManual: true, telefone: true },
        },
      },
    }),
    prisma.lembrete.findMany({
      where: {
        agenteId: agente.id,
        status: "PENDENTE",
        dataHora: { gte: de, lte: ate },
      },
      orderBy: { dataHora: "asc" },
      include: {
        lead: {
          select: { nome: true, pushName: true, nomeManual: true, telefone: true },
        },
      },
    }),
  ]);

  const eventos: EventoAgenda[] = [
    ...tarefas.map((t) => ({
      id: t.id,
      tipo: "tarefa" as const,
      titulo: t.titulo,
      descricao: t.descricao,
      dataHora: t.dataHora.toISOString(),
      duracaoMin: t.duracaoMin,
      leadId: t.leadId,
      negocioId: null,
      cliente: t.lead ? nomeEfetivo(t.lead) : null,
      finalidade: null,
      status: t.status,
      lembrarAntesMin: t.lembrarAntesMin,
    })),
    ...lembretes.map((l) => ({
      id: l.id,
      tipo: "lembrete" as const,
      titulo: l.nota?.trim() || "Contato agendado",
      descricao: l.nota,
      dataHora: l.dataHora.toISOString(),
      duracaoMin: null,
      leadId: l.leadId,
      negocioId: l.negocioId,
      cliente: l.lead ? nomeEfetivo(l.lead) : null,
      finalidade: l.finalidade as "VENDA" | "POS_VENDA",
      status: l.status,
      lembrarAntesMin: l.lembrarAntesMin,
    })),
  ];

  return NextResponse.json({ eventos });
}

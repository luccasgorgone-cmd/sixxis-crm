// Lembretes: cria (POST) e lista agrupado por janela (GET).
//  - POST {leadId, negocioId?, finalidade, dataHora, nota} -> cria (agenteId=logado),
//    registra Atividade(LEMBRETE). Exige acesso a finalidade (admin livre).
//  - GET ?escopo=meus|todos(admin)&quando=vencidos|hoje|proximos -> {vencidos,hoje,proximos}.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { temAcesso } from "@/lib/dono";
import { nomeEfetivo } from "@/lib/cliente";
import { janelaDe, fimDoDia, type Janela } from "@/lib/lembrete";
import { getIO } from "@/lib/socket";
import {
  Finalidade,
  StatusLembrete,
  AtividadeTipo,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LembreteComLead = {
  id: string;
  leadId: string;
  negocioId: string | null;
  finalidade: Finalidade;
  dataHora: Date;
  nota: string | null;
  status: StatusLembrete;
  lead: {
    nome: string | null;
    pushName: string | null;
    nomeManual: string | null;
    telefone: string;
    fotoUrl: string | null;
  };
  agente: { nome: string | null } | null;
};

function serializar(l: LembreteComLead) {
  return {
    id: l.id,
    leadId: l.leadId,
    negocioId: l.negocioId,
    finalidade: l.finalidade,
    dataHora: l.dataHora,
    nota: l.nota,
    status: l.status,
    cliente: {
      nomeEfetivo: nomeEfetivo(l.lead),
      telefone: l.lead.telefone,
      fotoUrl: l.lead.fotoUrl,
    },
    agente: l.agente?.nome ?? null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);
  const escopo = req.nextUrl.searchParams.get("escopo");
  const todos = admin && escopo === "todos";
  const quando = req.nextUrl.searchParams.get("quando") as Janela | null;

  const lembretes = await prisma.lembrete.findMany({
    where: {
      status: StatusLembrete.PENDENTE,
      ...(todos ? {} : { agenteId: agente.id }),
    },
    orderBy: { dataHora: "asc" },
    select: {
      id: true,
      leadId: true,
      negocioId: true,
      finalidade: true,
      dataHora: true,
      nota: true,
      status: true,
      lead: {
        select: {
          nome: true,
          pushName: true,
          nomeManual: true,
          telefone: true,
          fotoUrl: true,
        },
      },
      agente: { select: { nome: true } },
    },
  });

  const agora = new Date();
  const fimHoje = fimDoDia(undefined, agora);
  const grupos: Record<Janela, ReturnType<typeof serializar>[]> = {
    vencidos: [],
    hoje: [],
    proximos: [],
  };
  for (const l of lembretes) {
    grupos[janelaDe(l.dataHora, agora, fimHoje)].push(serializar(l));
  }

  if (quando && grupos[quando]) {
    return NextResponse.json({ [quando]: grupos[quando] });
  }
  return NextResponse.json(grupos);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  let body: {
    leadId?: string;
    negocioId?: string | null;
    finalidade?: string;
    dataHora?: string;
    nota?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const leadId = String(body?.leadId ?? "");
  if (!leadId) {
    return NextResponse.json({ erro: "leadId obrigatorio" }, { status: 400 });
  }
  if (
    body.finalidade !== Finalidade.VENDA &&
    body.finalidade !== Finalidade.POS_VENDA
  ) {
    return NextResponse.json({ erro: "finalidade invalida" }, { status: 400 });
  }
  const finalidade = body.finalidade;
  const dataHora = body.dataHora ? new Date(body.dataHora) : null;
  if (!dataHora || Number.isNaN(dataHora.getTime())) {
    return NextResponse.json({ erro: "dataHora invalida" }, { status: 400 });
  }

  // Acesso a finalidade (admin livre).
  if (!ehAdmin(agente.papel)) {
    const eu = await prisma.agente.findUnique({
      where: { id: agente.id },
      select: { acessoVenda: true, acessoPosVenda: true },
    });
    if (!eu || !temAcesso(eu, finalidade)) {
      return NextResponse.json(
        { erro: "sem acesso a essa finalidade" },
        { status: 403 },
      );
    }
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) {
    return NextResponse.json({ erro: "cliente nao encontrado" }, { status: 404 });
  }

  // Resolve negocioId quando nao informado (negocio da finalidade do lead).
  let negocioId = body.negocioId ?? null;
  if (!negocioId) {
    const neg = await prisma.negocio.findFirst({
      where: { leadId, finalidade },
      orderBy: { criadoEm: "desc" },
      select: { id: true },
    });
    negocioId = neg?.id ?? null;
  }

  const nota = body.nota?.trim() || null;
  const lembrete = await prisma.lembrete.create({
    data: {
      leadId,
      negocioId,
      agenteId: agente.id,
      finalidade,
      dataHora,
      nota,
    },
  });

  await prisma.atividade.create({
    data: {
      leadId,
      negocioId,
      agenteId: agente.id,
      tipo: AtividadeTipo.LEMBRETE,
      descricao: `Contato agendado para ${dataHora.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })}${nota ? ` — ${nota}` : ""}`,
    },
  });

  getIO()?.emit("lembrete:novo", { agenteId: agente.id, leadId });

  return NextResponse.json({ lembrete });
}

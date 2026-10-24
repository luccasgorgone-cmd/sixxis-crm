// API da PROSPECCAO ATIVA (Manual Fase 2). GET: lista os contatos do vendedor
// (ou todos, admin). POST: dispatch por acao — criar (1º contato), tentativa
// (canal), qualificar (promove ao funil normal), encerrar (sem resposta só com
// >=5 tentativas/2 canais, ou nao qualificado). NAO envia mensagem ao cliente.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { Finalidade, FaseProspeccao } from "@/generated/prisma/enums";
import { podeEncerrarSemResposta } from "@/lib/prospeccao/cadencia";
import { garantirNegocioParaLead } from "@/lib/negocio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canaisDe(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((c): c is string => typeof c === "string") : [];
}

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const escopo = ehAdmin(agente.papel) ? {} : { agenteId: agente.id };
  const contatos = await prisma.prospeccaoContato.findMany({
    where: escopo,
    orderBy: [{ fase: "asc" }, { proximaAcaoEm: "asc" }],
    select: {
      id: true, fase: true, tentativas: true, canais: true,
      primeiroContatoEm: true, proximaAcaoEm: true, nutricaoAte: true,
      lead: { select: { id: true, nome: true, nomeManual: true, pushName: true, telefone: true, empresa: true } },
    },
  });

  // Meta diaria (Manual Fase 2): 10 cadastros + 10 1os contatos por dia util.
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const [cadastradosHoje, primeirosContatosHoje] = await Promise.all([
    prisma.prospeccaoContato.count({ where: { ...escopo, criadoEm: { gte: inicioDia } } }),
    prisma.prospeccaoContato.count({ where: { ...escopo, primeiroContatoEm: { gte: inicioDia } } }),
  ]);
  return NextResponse.json({
    contatos,
    meta: { cadastradosHoje, primeirosContatosHoje, alvo: 10 },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  let body: { acao?: string; leadId?: string; id?: string; canal?: string; motivo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const agora = new Date();

  if (body.acao === "criar") {
    if (!body.leadId) return NextResponse.json({ erro: "leadId obrigatorio" }, { status: 400 });
    const existe = await prisma.prospeccaoContato.findUnique({ where: { leadId: body.leadId }, select: { id: true } });
    if (existe) return NextResponse.json({ erro: "lead ja esta em prospeccao", id: existe.id }, { status: 409 });
    const canal = body.canal?.trim() || "whatsapp";
    const contato = await prisma.prospeccaoContato.create({
      data: {
        leadId: body.leadId,
        agenteId: agente.id,
        fase: FaseProspeccao.ABORDAGEM,
        primeiroContatoEm: agora,
        proximaAcaoEm: agora,
        tentativas: 1,
        canais: [canal],
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: contato.id });
  }

  // As demais acoes operam num contato existente.
  if (!body.id) return NextResponse.json({ erro: "id obrigatorio" }, { status: 400 });
  const contato = await prisma.prospeccaoContato.findUnique({
    where: { id: body.id },
    select: { id: true, leadId: true, agenteId: true, fase: true, tentativas: true, canais: true, primeiroContatoEm: true },
  });
  if (!contato) return NextResponse.json({ erro: "contato nao encontrado" }, { status: 404 });
  // Dono do contato ou admin.
  if (!ehAdmin(agente.papel) && contato.agenteId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  if (body.acao === "tentativa") {
    const canal = body.canal?.trim();
    if (!canal) return NextResponse.json({ erro: "canal obrigatorio" }, { status: 400 });
    const canais = canaisDe(contato.canais);
    if (!canais.includes(canal)) canais.push(canal);
    await prisma.prospeccaoContato.update({
      where: { id: contato.id },
      data: {
        tentativas: { increment: 1 },
        canais,
        proximaAcaoEm: agora,
        ...(contato.primeiroContatoEm ? {} : { primeiroContatoEm: agora }),
      },
    });
    return NextResponse.json({ ok: true, tentativas: contato.tentativas + 1, canais });
  }

  if (body.acao === "qualificar") {
    // Promove ao funil normal de VENDA (entra em Novo/segue o fluxo passivo).
    await garantirNegocioParaLead(contato.leadId, Finalidade.VENDA, false, false);
    await prisma.prospeccaoContato.update({
      where: { id: contato.id },
      data: { fase: FaseProspeccao.QUALIFICADO, proximaAcaoEm: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "encerrar") {
    const motivo = body.motivo?.trim() || "nao_qualificado";
    // "Sem resposta" só com o minimo de tentativas/canais (Manual Fase 2).
    if (motivo === "sem_resposta") {
      const canais = canaisDe(contato.canais);
      if (!podeEncerrarSemResposta(contato.tentativas, canais.length)) {
        return NextResponse.json(
          { erro: "sem resposta exige >=5 tentativas em >=2 canais", tentativas: contato.tentativas, canais: canais.length },
          { status: 422 },
        );
      }
    }
    await prisma.prospeccaoContato.update({
      where: { id: contato.id },
      data: { fase: FaseProspeccao.ENCERRADO, encerradoMotivo: motivo, proximaAcaoEm: null },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "acao invalida" }, { status: 400 });
}

// Detalhe completo de um negocio (GET) e atualizacao com regras de fechamento
// e historico (PATCH). Ambos validam papel/ownership.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio, ehAdmin } from "@/lib/autorizacao";
import { includeCard, cardNegocio } from "@/lib/serializar";
import { getIO } from "@/lib/socket";
import { Prisma } from "@/generated/prisma/client";
import {
  StatusNeg,
  TipoEtapa,
  Temperatura,
  TipoHistorico,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ----------------------------------------------------------------------------
// GET: detalhe para o painel do negocio.
// ----------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    include: {
      ...includeCard,
      lead: {
        select: {
          id: true,
          nome: true,
          telefone: true,
          email: true,
          origem: true,
          etiquetas: { include: { etiqueta: true } },
          notas: {
            orderBy: { criadoEm: "desc" },
            include: { agente: { select: { nome: true } } },
          },
        },
      },
      historicos: {
        orderBy: { criadoEm: "desc" },
        include: { agente: { select: { nome: true } } },
      },
    },
  });

  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!podeAcessarNegocio(agente, negocio.agenteId)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // Conversa do lead (aberta mais recente) para embutir no painel.
  const conversa = await prisma.conversa.findFirst({
    where: { leadId: negocio.lead.id },
    orderBy: [{ status: "asc" }, { ultimaMensagemEm: "desc" }],
    select: { id: true, atendidoPor: true },
  });

  const card = cardNegocio(negocio);

  return NextResponse.json({
    negocio: {
      ...card,
      cliente: {
        id: negocio.lead.id,
        nome: negocio.lead.nome,
        telefone: negocio.lead.telefone,
        email: negocio.lead.email,
        origem: negocio.lead.origem,
      },
      produtos: negocio.produtos ?? null,
      motivoPerda: negocio.motivoPerda,
      fechadoEm: negocio.fechadoEm,
      conversaId: conversa?.id ?? null,
      atendidoPor: conversa?.atendidoPor ?? null,
      notas: negocio.lead.notas.map((n) => ({
        id: n.id,
        texto: n.texto,
        agente: n.agente?.nome ?? null,
        criadoEm: n.criadoEm,
      })),
      historico: negocio.historicos.map((h) => ({
        id: h.id,
        tipo: h.tipo,
        descricao: h.descricao,
        agente: h.agente?.nome ?? null,
        criadoEm: h.criadoEm,
      })),
    },
  });
}

// ----------------------------------------------------------------------------
// PATCH: etapa / valor / temperatura / agenteId / motivoPerda.
// ----------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: {
    etapaId?: string;
    valor?: number | null;
    temperatura?: Temperatura;
    agenteId?: string | null;
    motivoPerda?: string;
    produtos?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: { id: true, agenteId: true, valor: true, motivoPerda: true },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!podeAcessarNegocio(agente, negocio.agenteId)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // Vendedor nao pode atribuir negocio a OUTRO vendedor.
  if (
    body.agenteId !== undefined &&
    !ehAdmin(agente.papel) &&
    body.agenteId !== agente.id
  ) {
    return NextResponse.json(
      { erro: "sem permissao para atribuir a outro vendedor" },
      { status: 403 },
    );
  }

  const data: Prisma.NegocioUncheckedUpdateInput = {};
  const historicos: { tipo: TipoHistorico; descricao: string }[] = [];
  const agora = new Date();

  // ---- Mudanca de etapa ----
  if (body.etapaId) {
    const destino = await prisma.etapa.findUnique({
      where: { id: body.etapaId },
      select: { id: true, nome: true, tipo: true },
    });
    if (!destino) {
      return NextResponse.json(
        { erro: "etapa destino invalida" },
        { status: 400 },
      );
    }

    data.etapaId = destino.id;
    data.entrouEtapaEm = agora;

    if (destino.tipo === TipoEtapa.GANHO) {
      const valorEfetivo =
        body.valor != null
          ? body.valor
          : negocio.valor != null
            ? Number(negocio.valor)
            : null;
      if (valorEfetivo == null || valorEfetivo <= 0) {
        return NextResponse.json(
          { erro: "valor e obrigatorio para marcar como ganho" },
          { status: 422 },
        );
      }
      data.valor = valorEfetivo;
      data.status = StatusNeg.GANHO;
      data.fechadoEm = agora;
      historicos.push({
        tipo: TipoHistorico.GANHO,
        descricao: `Negocio ganho (${brl(valorEfetivo)})`,
      });
    } else if (destino.tipo === TipoEtapa.PERDIDO) {
      const motivo = body.motivoPerda?.trim() || negocio.motivoPerda || "";
      if (!motivo) {
        return NextResponse.json(
          { erro: "motivo e obrigatorio para marcar como perdido" },
          { status: 422 },
        );
      }
      data.motivoPerda = motivo;
      data.status = StatusNeg.PERDIDO;
      data.fechadoEm = agora;
      historicos.push({
        tipo: TipoHistorico.PERDA,
        descricao: `Negocio perdido: ${motivo}`,
      });
    } else {
      // Etapa ABERTA: reabre se estava fechado.
      data.status = StatusNeg.ABERTO;
      data.fechadoEm = null;
      historicos.push({
        tipo: TipoHistorico.ETAPA,
        descricao: `Movido para "${destino.nome}"`,
      });
    }
  }

  // ---- Valor (sem mudanca de etapa) ----
  if (body.valor !== undefined && data.valor === undefined) {
    data.valor = body.valor;
    historicos.push({
      tipo: TipoHistorico.VALOR,
      descricao:
        body.valor != null
          ? `Valor atualizado para ${brl(body.valor)}`
          : "Valor removido",
    });
  }

  // ---- Temperatura ----
  if (body.temperatura && body.temperatura in Temperatura) {
    data.temperatura = body.temperatura;
  }

  // ---- Atribuicao de vendedor ----
  if (body.agenteId !== undefined) {
    data.agenteId = body.agenteId;
    let nomeAlvo = "ninguem";
    if (body.agenteId) {
      const alvo = await prisma.agente.findUnique({
        where: { id: body.agenteId },
        select: { nome: true },
      });
      nomeAlvo = alvo?.nome ?? "vendedor";
    }
    historicos.push({
      tipo: TipoHistorico.ATRIBUICAO,
      descricao: body.agenteId
        ? `Atribuido a ${nomeAlvo}`
        : "Atribuicao removida",
    });
  }

  // ---- Motivo de perda avulso ----
  if (body.motivoPerda !== undefined && data.motivoPerda === undefined) {
    data.motivoPerda = body.motivoPerda;
  }

  // ---- Produtos (lista simples) ----
  if (body.produtos !== undefined) {
    data.produtos =
      body.produtos === null
        ? Prisma.JsonNull
        : (body.produtos as Prisma.InputJsonValue);
  }

  if (Object.keys(data).length === 0 && historicos.length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  const atualizado = await prisma.negocio.update({
    where: { id },
    data: {
      ...data,
      historicos: {
        create: historicos.map((h) => ({
          tipo: h.tipo,
          descricao: h.descricao,
          agenteId: agente.id,
        })),
      },
    },
    include: includeCard,
  });

  const card = cardNegocio(atualizado);

  // Tempo real: o quadro reage e atualiza/move o card.
  getIO()?.emit("negocio:atualizado", {
    negocioId: card.id,
    etapaId: card.etapaId,
    motivo: "patch",
  });

  return NextResponse.json({ negocio: card });
}

// Detalhe completo de um negocio (GET) e atualizacao com regras de fechamento
// e historico (PATCH). Ambos validam papel/ownership.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio, ehAdmin } from "@/lib/autorizacao";
import { includeCard, cardNegocio } from "@/lib/serializar";
import { nomeEfetivo } from "@/lib/cliente";
import { getIO } from "@/lib/socket";
import { Prisma } from "@/generated/prisma/client";
import {
  StatusNeg,
  TipoEtapa,
  Temperatura,
  TipoHistorico,
  AtividadeTipo,
  Finalidade,
} from "@/generated/prisma/enums";
import { espelharDonoNasConversas, temAcesso } from "@/lib/dono";
import { rotuloMotivo } from "@/lib/motivosPerda";
import { resolverAlertasNegocio } from "@/lib/slaAlertas";

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
          pushName: true,
          nomeManual: true,
          fotoUrl: true,
          telefone: true,
          email: true,
          empresa: true,
          cpf: true,
          cnpj: true,
          dataNascimento: true,
          anotacoes: true,
          aceitaContato: true,
          origem: true,
          notaFiscal: true,
          garantia: true,
          empresaFaturadaId: true,
          empresaFaturada: { select: { id: true, nome: true } },
          donoId: true,
          dono: { select: { id: true, nome: true } },
          donoPosVendaId: true,
          donoPosVenda: { select: { id: true, nome: true } },
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
  // LEITURA (mais permissiva que a edicao): admin le tudo; dono do negocio ou do
  // cliente le; e qualquer colaborador le negocios de uma FINALIDADE a que tem
  // acesso — pois e isso que as metas de EQUIPE e telas de equipe mostram
  // (inclusive negocios de outro vendedor ou sem dono). A escrita (PATCH) segue
  // estrita.
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  let podeLer =
    podeAcessarNegocio(agente, negocio.agenteId) || ehDonoCliente;
  if (!podeLer) {
    const eu = await prisma.agente.findUnique({
      where: { id: agente.id },
      select: { acessoVenda: true, acessoPosVenda: true },
    });
    podeLer = !!eu && temAcesso(eu, negocio.finalidade);
  }
  if (!podeLer) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // Conversa do lead (aberta mais recente) para embutir no painel.
  const conversa = await prisma.conversa.findFirst({
    where: { leadId: negocio.lead.id },
    orderBy: [{ status: "asc" }, { ultimaMensagemEm: "desc" }],
    select: { id: true, atendidoPor: true },
  });

  // Lembretes pendentes deste cliente (para a secao "Agendar contato").
  const lembretes = await prisma.lembrete.findMany({
    where: { leadId: negocio.lead.id, status: "PENDENTE" },
    orderBy: { dataHora: "asc" },
    include: { agente: { select: { nome: true } } },
  });

  const card = cardNegocio(negocio);

  return NextResponse.json({
    negocio: {
      ...card,
      cliente: {
        id: negocio.lead.id,
        nome: negocio.lead.nome,
        pushName: negocio.lead.pushName,
        nomeManual: negocio.lead.nomeManual,
        nomeEfetivo: nomeEfetivo(negocio.lead),
        fotoUrl: negocio.lead.fotoUrl,
        telefone: negocio.lead.telefone,
        email: negocio.lead.email,
        empresa: negocio.lead.empresa,
        cpf: negocio.lead.cpf,
        cnpj: negocio.lead.cnpj,
        dataNascimento: negocio.lead.dataNascimento,
        anotacoes: negocio.lead.anotacoes,
        aceitaContato: negocio.lead.aceitaContato,
        origem: negocio.lead.origem,
        notaFiscal: negocio.lead.notaFiscal,
        garantia: negocio.lead.garantia,
        empresaFaturadaId: negocio.lead.empresaFaturadaId,
        empresaFaturada: negocio.lead.empresaFaturada,
      },
      // Dono mostrado conforme a finalidade do negocio.
      dono:
        negocio.finalidade === Finalidade.VENDA
          ? negocio.lead.dono
            ? { id: negocio.lead.dono.id, nome: negocio.lead.dono.nome }
            : null
          : negocio.lead.donoPosVenda
            ? {
                id: negocio.lead.donoPosVenda.id,
                nome: negocio.lead.donoPosVenda.nome,
              }
            : null,
      produtos: negocio.produtos ?? null,
      motivoPerda: negocio.motivoPerda,
      motivoPerdaLabel: negocio.motivoPerda
        ? rotuloMotivo(negocio.motivoPerda)
        : null,
      motivoPerdaObs: negocio.motivoPerdaObs,
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
      lembretes: lembretes.map((l) => ({
        id: l.id,
        dataHora: l.dataHora,
        nota: l.nota,
        finalidade: l.finalidade,
        agente: l.agente?.nome ?? null,
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
    motivoPerdaObs?: string | null;
    produtos?: unknown;
    pendente?: boolean;
    motivoPendencia?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      leadId: true,
      agenteId: true,
      valor: true,
      motivoPerda: true,
      finalidade: true,
      pendente: true,
    },
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
  // Descricao da Atividade(PENDENCIA), registrada a parte (PENDENCIA nao existe
  // em TipoHistorico, so em AtividadeTipo).
  let atividadePendencia: string | null = null;
  const agora = new Date();

  // ---- Mudanca de etapa ----
  if (body.etapaId) {
    const destino = await prisma.etapa.findUnique({
      where: { id: body.etapaId },
      select: { id: true, nome: true, tipo: true, finalidade: true },
    });
    if (!destino) {
      return NextResponse.json(
        { erro: "etapa destino invalida" },
        { status: 400 },
      );
    }
    // A etapa destino tem de pertencer ao funil da finalidade do negocio.
    if (
      destino.finalidade !== "AMBAS" &&
      (destino.finalidade as unknown as Finalidade) !== negocio.finalidade
    ) {
      return NextResponse.json(
        { erro: "etapa de outro funil" },
        { status: 422 },
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
      const obs = body.motivoPerdaObs?.trim() || null;
      // Quando o motivo e OUTRO, a observacao livre e obrigatoria.
      if (motivo === "OUTRO" && !obs) {
        return NextResponse.json(
          { erro: "observacao e obrigatoria para o motivo Outro" },
          { status: 422 },
        );
      }
      data.motivoPerda = motivo;
      data.motivoPerdaObs = obs;
      data.status = StatusNeg.PERDIDO;
      data.fechadoEm = agora;
      const rotulo = rotuloMotivo(motivo);
      historicos.push({
        tipo: TipoHistorico.PERDA,
        descricao: obs
          ? `Negocio perdido: ${rotulo} — ${obs}`
          : `Negocio perdido: ${rotulo}`,
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
        select: { nome: true, acessoVenda: true, acessoPosVenda: true },
      });
      if (!alvo) {
        return NextResponse.json(
          { erro: "colaborador nao encontrado" },
          { status: 404 },
        );
      }
      // NUNCA atribuir uma finalidade a quem nao tem acesso a ela.
      const acesso =
        negocio.finalidade === Finalidade.VENDA
          ? alvo.acessoVenda
          : alvo.acessoPosVenda;
      if (!acesso) {
        return NextResponse.json(
          { erro: "colaborador sem acesso a essa finalidade" },
          { status: 403 },
        );
      }
      nomeAlvo = alvo.nome ?? "vendedor";
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
  if (body.motivoPerdaObs !== undefined && data.motivoPerdaObs === undefined) {
    data.motivoPerdaObs = body.motivoPerdaObs?.trim() || null;
  }

  // ---- Produtos (lista simples) ----
  if (body.produtos !== undefined) {
    data.produtos =
      body.produtos === null
        ? Prisma.JsonNull
        : (body.produtos as Prisma.InputJsonValue);
  }

  // ---- Pendencia operacional (marcar/desmarcar com motivo) ----
  if (body.pendente !== undefined) {
    const pendente = Boolean(body.pendente);
    data.pendente = pendente;
    if (pendente) {
      const motivo = (body.motivoPendencia ?? "").trim();
      if (!motivo) {
        return NextResponse.json(
          { erro: "motivo e obrigatorio para marcar como pendente" },
          { status: 422 },
        );
      }
      data.motivoPendencia = motivo;
      atividadePendencia = `Negocio marcado como pendente: ${motivo}`;
    } else {
      data.motivoPendencia = null;
      atividadePendencia = "Pendencia removida";
    }
  } else if (body.motivoPendencia !== undefined) {
    // Edicao do motivo sem alternar o estado.
    data.motivoPendencia = body.motivoPendencia?.trim() || null;
  }

  if (
    Object.keys(data).length === 0 &&
    historicos.length === 0 &&
    atividadePendencia === null
  ) {
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

  // Espelha os eventos na timeline do CLIENTE (Atividade). Os nomes de
  // TipoHistorico coincidem com AtividadeTipo para os casos gerados aqui.
  if (historicos.length > 0) {
    await prisma.atividade.createMany({
      data: historicos.map((h) => ({
        leadId: negocio.leadId,
        negocioId: negocio.id,
        agenteId: agente.id,
        tipo: h.tipo as unknown as AtividadeTipo,
        descricao: h.descricao,
      })),
    });
  }

  // SLA: mover de etapa ou fechar (ganho/perdido)/reabrir resolve os alertas
  // de SLA abertos deste negocio. O job recria para a nova etapa, se exceder.
  if (data.etapaId !== undefined || data.status !== undefined) {
    await resolverAlertasNegocio(id);
  }

  // Pendencia: registra a Atividade(PENDENCIA) na linha do tempo do cliente.
  if (atividadePendencia !== null) {
    await prisma.atividade.create({
      data: {
        leadId: negocio.leadId,
        negocioId: negocio.id,
        agenteId: agente.id,
        tipo: AtividadeTipo.PENDENCIA,
        descricao: atividadePendencia,
      },
    });
  }

  // Atribuir agente ao negocio tambem define o dono do lead (campo da
  // finalidade) e espelha nas conversas dessa finalidade.
  if (body.agenteId !== undefined) {
    await prisma.lead.update({
      where: { id: negocio.leadId },
      data:
        negocio.finalidade === Finalidade.VENDA
          ? { donoId: body.agenteId }
          : { donoPosVendaId: body.agenteId },
    });
    await espelharDonoNasConversas(
      prisma,
      negocio.leadId,
      negocio.finalidade,
      body.agenteId,
    );
  }

  const card = cardNegocio(atualizado);

  // Tempo real: o quadro reage e atualiza/move o card.
  getIO()?.emit("negocio:atualizado", {
    negocioId: card.id,
    etapaId: card.etapaId,
    motivo: "patch",
  });

  return NextResponse.json({ negocio: card });
}

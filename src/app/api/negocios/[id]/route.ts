// Detalhe completo de um negocio (GET) e atualizacao com regras de fechamento
// e historico (PATCH). Ambos validam papel/ownership.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio, ehAdmin } from "@/lib/autorizacao";
import { includeCard, cardNegocio } from "@/lib/serializar";
import { serializarClientePainel } from "@/lib/cliente";
import { parseDataNascimento, calcularTotalFinal } from "@/lib/format";
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
import { ehCodigoPendencia, rotuloPendencia } from "@/lib/motivosPendencia";
import { resolverAlertasNegocio } from "@/lib/slaAlertas";
import { dispararPurchase } from "@/lib/metaCapi";
import { movimentarPeca, estornarSaidasNegocio } from "@/lib/pecas";
import { proximoNumeroOrcamento, comRetryNumeroOrcamento } from "@/lib/orcamento";
import { normalizarPagamentos, lerPagamentos } from "@/lib/pagamento";

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
          segmento: true,
          dataNascimento: true,
          anotacoes: true,
          aceitaContato: true,
          origem: true,
          origemDetalhe: true,
          anuncioId: true,
          anuncioTitulo: true,
          anuncioUrl: true,
          ctwaClid: true,
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
      rastreios: { orderBy: { criadoEm: "asc" } },
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

  // Conversa a embutir no painel: a MESMA que o Inbox mostra — a conversa ATIVA
  // (arquivada = false) da FINALIDADE do negocio. Sem esses filtros, o findFirst
  // podia pegar uma conversa arquivada antiga (ou a de outra finalidade), que nao
  // tem as mensagens OUT do atendente enviadas na conversa ativa — por isso as
  // mensagens do atendente "sumiam" no Kanban. @@unique([leadId, finalidade]) em
  // arquivada=false garante no maximo uma; fica deterministico e igual ao Inbox.
  const conversa = await prisma.conversa.findFirst({
    where: {
      leadId: negocio.lead.id,
      finalidade: negocio.finalidade,
      arquivada: false,
    },
    orderBy: [{ ultimaMensagemEm: "desc" }, { criadoEm: "desc" }],
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
      // Base do ClientePainel via serializador compartilhado (mesmo shape do
      // Inbox e da supervisao) + extras de acompanhamento (NF/garantia/empresa).
      cliente: {
        ...serializarClientePainel(negocio.lead),
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
      // Transporte + rastreio (venda e pos-venda).
      transportadora: negocio.transportadora,
      dataEnvio: negocio.dataEnvio,
      previsaoChegada: negocio.previsaoChegada,
      rastreios: negocio.rastreios.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        transportadora: r.transportadora,
        criadoEm: r.criadoEm,
      })),
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
    // Motivo estruturado da pendencia (Fatia 3.17): code predefinido + observacao.
    motivoPendenciaCode?: string | null;
    transportadora?: string | null;
    dataEnvio?: string | null;
    previsaoChegada?: string | null;
    // Fechamento de pedido (ganho): itens + frete. Quando presentes, o valor do
    // negocio (total) e derivado deles (produtos + frete) e ItemPedido e gravado.
    itens?: {
      produtoCatalogoId?: string | null;
      descricao?: string;
      quantidade?: number;
      valorUnitario?: number;
      garantia?: boolean;
    }[];
    frete?: number | null;
    fretePagoPelaEmpresa?: boolean;
    // Pos-venda (pecas): valor final realmente cobrado quando houve desconto.
    valorAjustado?: number | null;
    // Pos-venda: modelo do aparelho do cliente (marcado no atendimento).
    modeloProdutoCliente?: string | null;
    // Rascunho do orcamento (Fatia 3.09): cupom/desconto/frete.
    orcCupom?: string | null;
    orcDescontoPct?: number | null;
    orcFrete?: number | null;
    orcFretePagoPelaEmpresa?: boolean;
    // Transportadora escolhida na cotacao da Loja (Fase 2). null limpa.
    orcFreteTransportadora?: string | null;
    // Formas de pagamento do rascunho (Fatia 3.18): array de { metodo, valor, parcelas }.
    orcPagamentos?: unknown;
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
      status: true,
      motivoPerda: true,
      finalidade: true,
      pendente: true,
      // Rascunho do orcamento (Fatia 3.09) -> congela no snapshot da decisao.
      orcCupom: true,
      orcDescontoPct: true,
      orcFrete: true,
      orcFretePagoPelaEmpresa: true,
      orcFreteTransportadora: true,
      orcPagamentos: true,
      // Donos do lead por finalidade: o DONO edita o negocio do proprio cliente,
      // inclusive quando o negocio ainda nao tem agenteId (criado ao abrir a
      // conversa/cadastro manual). Fatia 2.86.
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  // ESCRITA: admin, dono do negocio, ou DONO do cliente na finalidade do negocio.
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
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

  // Pecas / pos-venda: garantia e baixa de estoque so valem para POS_VENDA. Em
  // VENDA nada disso executa (fluxo e conversao Meta preservados).
  const ehPosVenda = negocio.finalidade === Finalidade.POS_VENDA;

  // ---- Fechamento de PEDIDO (opcional): itens + frete ----
  // Normaliza os itens e calcula os totais. Quando ha itens, o VALOR do negocio
  // (total) passa a ser produtos COBRAVEIS + frete — itens em garantia (so
  // pos-venda) NUNCA somam no total cobrado, mas a peca sai do estoque igual.
  const itensPedido = Array.isArray(body.itens)
    ? body.itens
        .map((it) => ({
          produtoCatalogoId:
            typeof it.produtoCatalogoId === "string" ? it.produtoCatalogoId : null,
          descricao: String(it.descricao ?? "").trim(),
          quantidade: Math.max(1, Math.floor(Number(it.quantidade) || 1)),
          valorUnitario: Math.max(0, Number(it.valorUnitario) || 0),
          // Garantia so tem efeito no pos-venda; em venda e sempre false.
          garantia: ehPosVenda && it.garantia === true,
        }))
        .filter((it) => it.descricao)
    : [];
  const temPedido = itensPedido.length > 0;
  // Produtos = soma dos COBRAVEIS (exclui garantia). Em venda == todos os itens.
  const valorProdutos = temPedido
    ? itensPedido
        .filter((it) => !it.garantia)
        .reduce((acc, it) => acc + it.quantidade * it.valorUnitario, 0)
    : null;
  const freteInformado =
    body.frete !== undefined && body.frete !== null
      ? Math.max(0, Number(body.frete) || 0)
      : null;
  // Frete pago pela empresa: nao soma ao total (vira despesa rastreavel).
  const fretePagoEmpresa = body.fretePagoPelaEmpresa === true;
  const totalPedido = temPedido
    ? (valorProdutos ?? 0) + (fretePagoEmpresa ? 0 : (freteInformado ?? 0))
    : null;

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
      // Total: do PEDIDO (produtos + frete) quando ha itens; senao o valor
      // informado (fluxo antigo) ou o valor atual do negocio.
      const valorEfetivo =
        totalPedido != null
          ? totalPedido
          : body.valor != null
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
      // Fechamento de pedido: grava os itens (substitui os anteriores deste
      // negocio) + valorProdutos + frete. O historico do cliente guarda o pedido.
      if (temPedido) {
        data.valorProdutos = valorProdutos;
        // Frete: quando pago pela empresa, o cliente nao paga (frete=null) e o
        // valor vira DESPESA (freteDespesa); senao soma normalmente ao total.
        data.fretePagoPelaEmpresa = fretePagoEmpresa;
        if (fretePagoEmpresa) {
          data.frete = null;
          data.freteDespesa = freteInformado;
        } else {
          data.frete = freteInformado;
          data.freteDespesa = null;
        }
        data.itensPedido = {
          deleteMany: {},
          create: itensPedido.map((it) => ({
            produtoCatalogoId: it.produtoCatalogoId,
            descricao: it.descricao,
            quantidade: it.quantidade,
            valorUnitario: it.valorUnitario,
            subtotal: it.quantidade * it.valorUnitario,
            garantia: it.garantia,
          })),
        };
        // Valor final REALMENTE cobrado quando difere do calculado (desconto/
        // frete). Fatia 3.09: vale para VENDA e POS_VENDA — a leitura usa
        // valorAjustado ?? valor. NUNCA toca `valor` (base da conversao Meta, que
        // segue usando o total pre-desconto), so registra o cobrado para exibicao.
        {
          const aj = body.valorAjustado;
          data.valorAjustado =
            typeof aj === "number" &&
            Number.isFinite(aj) &&
            aj >= 0 &&
            Math.abs(aj - (totalPedido ?? 0)) > 0.005
              ? aj
              : null;
        }
      } else if (freteInformado != null) {
        data.frete = freteInformado;
      }
      const detalhePedido = temPedido
        ? ` — ${itensPedido.length} ${itensPedido.length === 1 ? "item" : "itens"}${
            freteInformado
              ? fretePagoEmpresa
                ? ` + frete ${brl(freteInformado)} (despesa da empresa)`
                : ` + frete ${brl(freteInformado)}`
              : ""
          }`
        : "";
      historicos.push({
        tipo: TipoHistorico.GANHO,
        descricao: `Negocio ganho (${brl(valorEfetivo)})${detalhePedido}`,
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

  // ---- Pendencia operacional (marcar/desmarcar com MOTIVO ESTRUTURADO) ----
  // Fatia 3.17: motivoPendenciaCode = CODE predefinido (obrigatorio); motivoPendencia
  // = observacao livre (obrigatoria em OUTRO). Compatibilidade: se vier so texto
  // (fluxo antigo), aceita o texto como motivo sem code.
  if (body.pendente !== undefined) {
    const pendente = Boolean(body.pendente);
    data.pendente = pendente;
    if (pendente) {
      const code = (body.motivoPendenciaCode ?? "").trim();
      const obs = (body.motivoPendencia ?? "").trim();
      if (!code && !obs) {
        return NextResponse.json(
          { erro: "Escolha o motivo da pendência." },
          { status: 422 },
        );
      }
      if (code && !ehCodigoPendencia(code)) {
        return NextResponse.json(
          { erro: "Motivo de pendência inválido." },
          { status: 422 },
        );
      }
      if (code === "OUTRO" && !obs) {
        return NextResponse.json(
          { erro: "Descreva o motivo (Outro)." },
          { status: 422 },
        );
      }
      data.motivoPendenciaCode = code || null;
      data.motivoPendencia = obs || null;
      const rotulo = code ? rotuloPendencia(code) : obs;
      atividadePendencia = `Negocio marcado como pendente: ${rotulo}${
        obs && code ? ` — ${obs}` : ""
      }`;
    } else {
      data.motivoPendencia = null;
      data.motivoPendenciaCode = null;
      atividadePendencia = "Pendencia removida";
    }
  } else if (
    body.motivoPendencia !== undefined ||
    body.motivoPendenciaCode !== undefined
  ) {
    // Edicao do motivo sem alternar o estado.
    if (body.motivoPendencia !== undefined) {
      data.motivoPendencia = body.motivoPendencia?.trim() || null;
    }
    if (body.motivoPendenciaCode !== undefined) {
      const c = body.motivoPendenciaCode?.trim() || null;
      if (c && !ehCodigoPendencia(c)) {
        return NextResponse.json(
          { erro: "Motivo de pendência inválido." },
          { status: 422 },
        );
      }
      data.motivoPendenciaCode = c;
    }
  }

  // ---- Transporte (transportadora principal + datas de envio/previsao) ----
  if (body.transportadora !== undefined) {
    data.transportadora =
      body.transportadora === null || String(body.transportadora).trim() === ""
        ? null
        : String(body.transportadora).trim();
  }
  for (const campo of ["dataEnvio", "previsaoChegada"] as const) {
    if (body[campo] !== undefined) {
      const parsed = parseDataNascimento(body[campo]);
      if (!parsed.ok) {
        return NextResponse.json(
          { erro: `${campo} invalida` },
          { status: 400 },
        );
      }
      data[campo] = parsed.valor;
    }
  }

  // ---- Modelo do produto do cliente (pos-venda): trim, max 60, null limpa ----
  if (ehPosVenda && body.modeloProdutoCliente !== undefined) {
    const m =
      body.modeloProdutoCliente === null
        ? null
        : String(body.modeloProdutoCliente).trim().slice(0, 60) || null;
    data.modeloProdutoCliente = m;
  }

  // ---- Rascunho do orcamento (Fatia 3.09): cupom / desconto% / frete ----
  if (body.orcCupom !== undefined) {
    data.orcCupom =
      body.orcCupom === null ? null : String(body.orcCupom).trim().slice(0, 40) || null;
  }
  if (body.orcDescontoPct !== undefined) {
    if (body.orcDescontoPct === null) {
      data.orcDescontoPct = null;
    } else {
      const p = Number(body.orcDescontoPct);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        return NextResponse.json({ erro: "desconto invalido (0 a 100)" }, { status: 400 });
      }
      data.orcDescontoPct = p;
    }
  }
  if (body.orcFrete !== undefined) {
    if (body.orcFrete === null) {
      data.orcFrete = null;
    } else {
      const f = Number(body.orcFrete);
      if (!Number.isFinite(f) || f < 0) {
        return NextResponse.json({ erro: "frete invalido" }, { status: 400 });
      }
      data.orcFrete = f;
    }
  }
  if (body.orcFretePagoPelaEmpresa !== undefined) {
    data.orcFretePagoPelaEmpresa = body.orcFretePagoPelaEmpresa === true;
  }
  // Transportadora do frete (Fase 2): string curta (nome da cotacao) ou null.
  if (body.orcFreteTransportadora !== undefined) {
    data.orcFreteTransportadora =
      body.orcFreteTransportadora === null
        ? null
        : String(body.orcFreteTransportadora).trim().slice(0, 60) || null;
  }

  // ---- Formas de pagamento do rascunho (Fatia 3.18) ----
  // Metadado (nao altera total/Meta). Valida code/valor/parcelas; array vazio ou
  // null limpa. Persiste como Json (JsonNull quando vazio).
  if (body.orcPagamentos !== undefined) {
    const norm = normalizarPagamentos(body.orcPagamentos);
    if (!norm.ok) {
      return NextResponse.json({ erro: norm.erro }, { status: 400 });
    }
    data.orcPagamentos =
      norm.linhas.length > 0
        ? (norm.linhas as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
  }

  if (
    Object.keys(data).length === 0 &&
    historicos.length === 0 &&
    atividadePendencia === null
  ) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  const dataFinal: Prisma.NegocioUncheckedUpdateInput = {
    ...data,
    historicos: {
      create: historicos.map((h) => ({
        tipo: h.tipo,
        descricao: h.descricao,
        agenteId: agente.id,
      })),
    },
  };
  const executarUpdate = (client: Prisma.TransactionClient) =>
    client.negocio.update({ where: { id }, data: dataFinal, include: includeCard });

  // Baixa/estorno de estoque de PECAS (Fatia 3.02) — SO pos-venda:
  // - fechandoGanhoPeca: fecha como GANHO com itens -> baixa (SAIDA) das pecas.
  // - saindoDeGanho: reabrir/perdir a partir de GANHO -> estorna as SAIDAs. Idempotente.
  const fechandoGanhoPeca =
    ehPosVenda && data.status === StatusNeg.GANHO && temPedido;
  const saindoDeGanho =
    ehPosVenda &&
    negocio.status === StatusNeg.GANHO &&
    data.status !== undefined &&
    data.status !== StatusNeg.GANHO;

  // DECISAO do atendimento (Fatia 3.07): Ganho / Perdido / Pendente. Quando ha
  // decisao e o staging (ou o pedido, no ganho) tem itens, geramos um ORCAMENTO
  // (snapshot + numero de pedido) na MESMA transacao. Regras por decisao:
  //  - GANHO: snapshot dos ITENS DO PEDIDO + fluxo atual (ItemPedido, baixa,
  //    valorAjustado) + staging apagado (consumido).
  //  - PERDIDO: snapshot do STAGING (proposta recusada, registrada) + staging apagado.
  //  - PENDENTE: snapshot do STAGING; staging PERMANECE (proposta segue editavel;
  //    um novo Pendente com itens alterados gera novo numero -> versoes da proposta).
  const decisao: "GANHO" | "PERDIDO" | "PENDENTE" | null =
    data.status === StatusNeg.GANHO
      ? "GANHO"
      : data.status === StatusNeg.PERDIDO
        ? "PERDIDO"
        : data.pendente === true
          ? "PENDENTE"
          : null;
  const finalidadeStr =
    negocio.finalidade === Finalidade.POS_VENDA ? "POS_VENDA" : "VENDA";

  let numeroOrcamentoGerado: number | null = null;
  let atualizado: Awaited<ReturnType<typeof executarUpdate>>;

  if (fechandoGanhoPeca || saindoDeGanho || decisao !== null) {
    // Retry por conflito de numero: cada tentativa e atomica (o rollback desfaz a
    // baixa da tentativa perdida), entao repetir e seguro.
    atualizado = await comRetryNumeroOrcamento(() =>
      prisma.$transaction(async (tx) => {
        const upd = await executarUpdate(tx);
        // Estorno ao sair do ganho (pos-venda).
        if (saindoDeGanho) {
          await estornarSaidasNegocio(tx, {
            negocioId: id,
            leadId: negocio.leadId,
            agenteId: agente.id,
          });
        }
        // Baixa ao fechar como ganho (pos-venda com pecas do catalogo).
        if (fechandoGanhoPeca) {
          for (const it of itensPedido) {
            if (!it.produtoCatalogoId) continue;
            await movimentarPeca({
              tx,
              pecaId: it.produtoCatalogoId,
              tipo: "SAIDA",
              quantidade: it.quantidade,
              motivo: it.garantia ? "garantia" : "venda",
              negocioId: id,
              leadId: negocio.leadId,
              agenteId: agente.id,
            });
          }
        }

        // Snapshot do orcamento-decisao.
        if (decisao) {
          // Fonte: GANHO -> itens do pedido; PERDIDO/PENDENTE -> staging.
          let fonte: {
            produtoCatalogoId: string | null;
            descricao: string;
            quantidade: number;
            valorUnitario: number;
            garantia: boolean;
          }[];
          if (decisao === "GANHO") {
            fonte = itensPedido.map((it) => ({
              produtoCatalogoId: it.produtoCatalogoId,
              descricao: it.descricao,
              quantidade: it.quantidade,
              valorUnitario: it.valorUnitario,
              garantia: it.garantia,
            }));
          } else {
            const staging = await tx.pecaUso.findMany({
              where: { negocioId: id, origem: "NEGOCIO" },
              select: {
                pecaId: true,
                quantidade: true,
                garantia: true,
                peca: { select: { nome: true, modelo: true, voltagem: true, precoSugerido: true } },
              },
            });
            fonte = staging.map((s) => ({
              produtoCatalogoId: s.pecaId,
              descricao: [s.peca.nome, s.peca.modelo, s.peca.voltagem].filter(Boolean).join(" "),
              quantidade: s.quantidade,
              valorUnitario:
                s.peca.precoSugerido != null ? Number(s.peca.precoSugerido) : 0,
              garantia: s.garantia,
            }));
          }
          if (fonte.length > 0) {
            const totalCobravel = fonte
              .filter((i) => !i.garantia)
              .reduce((a, i) => a + i.quantidade * i.valorUnitario, 0);
            const totalGar = fonte
              .filter((i) => i.garantia)
              .reduce((a, i) => a + i.quantidade * i.valorUnitario, 0);
            // Cupom/desconto/frete do rascunho -> congela no snapshot. totalFinal
            // aplica a formula compartilhada (Fatia 3.09).
            const descontoPct =
              negocio.orcDescontoPct != null ? Number(negocio.orcDescontoPct) : null;
            const frete = negocio.orcFrete != null ? Number(negocio.orcFrete) : null;
            const fretePagoEmpresa = negocio.orcFretePagoPelaEmpresa === true;
            const totalFinal = calcularTotalFinal({
              totalCobravel,
              descontoPct,
              frete,
              fretePagoPelaEmpresa: fretePagoEmpresa,
            });
            const numero = await proximoNumeroOrcamento(tx);
            // Formas de pagamento CONGELADAS: usa as enviadas neste PATCH (ex.: modal
            // de GANHO editou) e, na ausencia, o rascunho armazenado. Metadado —
            // nao afeta total/Meta. Opcional (pode nao haver nenhuma).
            const pagamentosSnapshot =
              body.orcPagamentos !== undefined
                ? lerPagamentos(body.orcPagamentos)
                : lerPagamentos(negocio.orcPagamentos);
            await tx.orcamento.create({
              data: {
                numero,
                negocioId: id,
                leadId: negocio.leadId,
                finalidade: finalidadeStr,
                decisao,
                total: totalCobravel,
                totalGarantia: totalGar > 0 ? totalGar : null,
                cupom: negocio.orcCupom ?? null,
                descontoPct,
                frete,
                fretePagoPelaEmpresa: fretePagoEmpresa,
                // Transportadora do frete CONGELADA no snapshot (Fase 2).
                freteTransportadora: negocio.orcFreteTransportadora ?? null,
                totalFinal,
                pagamentos:
                  pagamentosSnapshot.length > 0
                    ? (pagamentosSnapshot as unknown as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
                agenteId: agente.id,
                itens: {
                  create: fonte.map((i) => ({
                    produtoCatalogoId: i.produtoCatalogoId,
                    descricao: i.descricao,
                    quantidade: i.quantidade,
                    valorUnitario: i.valorUnitario,
                    garantia: i.garantia,
                  })),
                },
              },
            });
            numeroOrcamentoGerado = numero;
          }
        }

        // Staging: GANHO/PERDIDO consomem (apagam); PENDENTE mantem editavel.
        if (decisao === "GANHO" || decisao === "PERDIDO") {
          await tx.pecaUso.deleteMany({
            where: { negocioId: id, origem: "NEGOCIO" },
          });
        }
        return upd;
      }),
    );
  } else {
    atualizado = await executarUpdate(prisma);
  }

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

  // Meta Conversions API: ao marcar GANHO com valor, dispara "Purchase" com a
  // atribuicao do anuncio (ctwaClid), deduplicado por negocio. Best-effort.
  if (data.status === StatusNeg.GANHO) {
    try {
      const leadCapi = await prisma.lead.findUnique({
        where: { id: negocio.leadId },
        select: {
          ctwaClid: true,
          telefone: true,
          email: true,
          nome: true,
          pushName: true,
          nomeManual: true,
        },
      });
      // Integridade (Fatia 2.71/2.72/2.76): `atualizado.valor` E o TOTAL COBRADO
      // DO CLIENTE — produtos + frete quando o cliente paga o frete, ou SO
      // produtos quando o frete e pago pela empresa (despesa, fora do total). A
      // conversao usa esse valor (o que o cliente realmente pagou). O eventId
      // `purchase-${id}` mantem o dedup por negocio. NAO alterar.
      const valorVenda =
        atualizado.valor != null ? Number(atualizado.valor) : null;
      if (leadCapi && valorVenda && valorVenda > 0) {
        await dispararPurchase({
          ctwaClid: leadCapi.ctwaClid,
          valor: valorVenda,
          moeda: "BRL",
          eventId: `purchase-${id}`,
          telefone: leadCapi.telefone,
          email: leadCapi.email,
          nome: leadCapi.nomeManual || leadCapi.pushName || leadCapi.nome,
        });
      }
    } catch (e) {
      console.warn(
        `[capi] falha ao enviar Purchase do negocio ${id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
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

  // orcamentoNumero: numero do orcamento-decisao gerado (para o toast). null quando
  // a decisao nao tinha itens (nao gerou orcamento).
  return NextResponse.json({ negocio: card, orcamentoNumero: numeroOrcamentoGerado });
}

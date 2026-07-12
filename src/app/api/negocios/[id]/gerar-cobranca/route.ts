// Gera o LINK de pagamento (Mercado Pago / Checkout Pro) do orcamento (Fase 3 —
// Bloco 2). Escopo dono/admin. Reusa o valor JA calculado do orcamento
// (montarDadosPdfOrcamento -> dados.totalFinal, INCLUINDO frete) e chama a Loja
// via pagamentoLoja.criarCobranca. Registra/atualiza o Pagamento local (pendente).
//
// Idempotencia 1-N (Fatia A): opera sobre a cobranca MAIS RECENTE do negocio.
//  a) recente pendente, MESMO valor -> reaproveita o link (nao cria outro);
//  b) recente pendente, valor DIFERENTE -> gera novo link no MP e ATUALIZA a linha;
//  c) recente PAGA (ou nao existe) -> CRIA NOVA LINHA "crm-{id}-{seq}" (seq =
//     count de cobrancas + 1). Nunca muta linha paga.
// TRAVA: pagamento nunca quebra o atendimento — falha da Loja retorna { ok:false }.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { checarAcessoNegocio, montarDadosPdfOrcamento } from "@/lib/orcamentoDados";
import { criarCobranca } from "@/lib/pagamentoLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// URL publica do CRM -> notification_url do webhook do MP. Sem ela (ou nao-https)
// nao ha como o MP notificar o "pago"; a Loja tambem exige https.
function webhookUrl(): string | null {
  const base = (process.env.CRM_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!base || !base.startsWith("https://")) return null;
  return `${base}/api/webhook/mercadopago`;
}

// GET: cobranca ATUAL (mais recente) do negocio + historico resumido de todas
// (para a UI exibir o selo/link atual e o colapsavel de anteriores).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const acesso = await checarAcessoNegocio(agente, id);
  if (!acesso.ok) return NextResponse.json({ erro: acesso.erro }, { status: acesso.status });

  // Todas as cobrancas do negocio, mais recente primeiro.
  const cobrancas = await prisma.pagamento.findMany({
    where: { negocioId: id },
    orderBy: { criadoEm: "desc" },
    select: {
      externalReference: true,
      status: true,
      initPoint: true,
      referencia: true,
      valor: true,
      pagoEm: true,
      atualizadoEm: true,
      criadoEm: true,
    },
  });
  const atual = cobrancas[0] ?? null;
  return NextResponse.json({
    pagamento: atual
      ? {
          status: atual.status,
          initPoint: atual.initPoint,
          referencia: atual.referencia,
          valor: atual.valor != null ? Number(atual.valor) : null,
          pagoEm: atual.pagoEm,
          atualizadoEm: atual.atualizadoEm,
        }
      : null,
    // Historico resumido (inclui a atual). Chave estavel = externalReference.
    historico: cobrancas.map((c) => ({
      externalReference: c.externalReference,
      status: c.status,
      valor: c.valor != null ? Number(c.valor) : null,
      referencia: c.referencia,
      criadoEm: c.criadoEm,
      pagoEm: c.pagoEm,
    })),
  });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;

  const acesso = await checarAcessoNegocio(agente, id);
  if (!acesso.ok) return NextResponse.json({ erro: acesso.erro }, { status: acesso.status });

  const montagem = await montarDadosPdfOrcamento(id);
  if (!montagem) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  if (!montagem.temItens) {
    return NextResponse.json({ erro: "Orçamento sem itens." }, { status: 422 });
  }

  const valor = Math.round(Number(montagem.dados.totalFinal) * 100) / 100;
  if (!(valor > 0)) {
    // Total zero = pedido todo em garantia (pos-venda): nada a cobrar do cliente.
    return NextResponse.json(
      { erro: "Nada a cobrar — pedido em garantia." },
      { status: 422 },
    );
  }

  // Idempotencia 1-N: decide sobre a cobranca MAIS RECENTE do negocio.
  const recente = await prisma.pagamento.findFirst({
    where: { negocioId: id },
    orderBy: { criadoEm: "desc" },
  });

  // a) recente pendente com o MESMO valor -> reaproveita o link (nao duplica).
  if (
    recente &&
    recente.status === "pendente" &&
    recente.initPoint &&
    Number(recente.valor) === valor
  ) {
    return NextResponse.json({
      ok: true,
      initPoint: recente.initPoint,
      status: "pendente",
      referencia: recente.referencia,
      reaproveitado: true,
    });
  }

  // Decisao entre (b) atualizar a linha pendente atual e (c) criar nova linha.
  //  - atualizar: recente existe e esta pendente (valor diferente da regra "a").
  //  - criar: recente inexistente OU recente ja PAGA/cancelada/erro (nunca muta paga).
  const atualizarLinha = recente != null && recente.status === "pendente";
  let refLoja: string; // vira external_reference "crm-{refLoja}" na Loja
  let extRefFallback: string;
  if (atualizarLinha) {
    // (b) mesma externalReference da linha (legado "crm-{id}" ou "crm-{id}-{seq}").
    extRefFallback = recente!.externalReference;
    refLoja = recente!.externalReference.replace(/^crm-/, "");
  } else {
    // (c) nova linha: seq = total de cobrancas do negocio + 1.
    const total = await prisma.pagamento.count({ where: { negocioId: id } });
    refLoja = `${id}-${total + 1}`;
    extRefFallback = `crm-${refLoja}`;
  }

  const notificationUrl = webhookUrl();
  if (!notificationUrl) {
    return NextResponse.json(
      { ok: false, erro: "URL pública do CRM (CRM_PUBLIC_URL https) não configurada." },
      { status: 503 },
    );
  }

  // Pagador (opcional): nome + email do lead, quando houver.
  const lead = await prisma.lead.findUnique({
    where: { id: montagem.leadId },
    select: { email: true },
  });
  const emailValido =
    lead?.email && /.+@.+\..+/.test(lead.email) ? lead.email : undefined;

  const cob = await criarCobranca({
    referencia: refLoja, // -> external_reference "crm-{refLoja}" na Loja
    descricao: `Orçamento ${montagem.numeroFormatado} — Sixxis Assistência`,
    valor,
    notificationUrl,
    pagador: { nome: montagem.nomeCliente || undefined, email: emailValido },
  });

  if (!cob.ok || !cob.initPoint) {
    return NextResponse.json(
      { ok: false, erro: cob.mensagem || "Não foi possível gerar o link de pagamento." },
      { status: 502 },
    );
  }

  const extRef = cob.externalReference ?? extRefFallback;

  let pag;
  if (atualizarLinha) {
    // (b) Atualiza a MESMA linha pendente (recente!.id). Nunca uma linha paga.
    pag = await prisma.pagamento.update({
      where: { id: recente!.id },
      data: {
        referencia: montagem.numeroFormatado,
        valor,
        status: "pendente",
        mpPreferenceId: cob.preferenceId ?? null,
        initPoint: cob.initPoint,
        // Regerou -> volta a pendente e limpa a data de pagamento antiga.
        pagoEm: null,
      },
    });
  } else {
    // (c) NOVA linha. orcamentoId = null (o vinculo vem no Bloco 4, na decisao).
    pag = await prisma.pagamento.create({
      data: {
        negocioId: id,
        referencia: montagem.numeroFormatado,
        externalReference: extRef,
        valor,
        status: "pendente",
        mpPreferenceId: cob.preferenceId ?? null,
        initPoint: cob.initPoint,
        orcamentoId: null,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    initPoint: pag.initPoint,
    status: pag.status,
    referencia: pag.referencia,
  });
}

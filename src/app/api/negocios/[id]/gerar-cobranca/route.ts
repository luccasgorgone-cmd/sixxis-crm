// Gera o LINK de pagamento (Mercado Pago / Checkout Pro) do orcamento (Fase 3 —
// Bloco 2). Escopo dono/admin. Reusa o valor JA calculado do orcamento
// (montarDadosPdfOrcamento -> dados.totalFinal, INCLUINDO frete) e chama a Loja
// via pagamentoLoja.criarCobranca. Registra/atualiza o Pagamento local (pendente).
//
// Idempotencia: uma cobranca ATIVA por negocio (externalReference "crm-{id}"
// unico). Se ja existe pendente com o MESMO valor, reaproveita o link (nao cria
// outro). Ja paga -> nao regenera. Valor mudou -> gera novo link e atualiza a linha.
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

// GET: status atual da cobranca do negocio (para a UI exibir o selo/link).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const acesso = await checarAcessoNegocio(agente, id);
  if (!acesso.ok) return NextResponse.json({ erro: acesso.erro }, { status: acesso.status });

  const pag = await prisma.pagamento.findUnique({
    where: { externalReference: `crm-${id}` },
    select: {
      status: true,
      initPoint: true,
      referencia: true,
      valor: true,
      pagoEm: true,
      atualizadoEm: true,
    },
  });
  return NextResponse.json({
    pagamento: pag
      ? {
          status: pag.status,
          initPoint: pag.initPoint,
          referencia: pag.referencia,
          valor: pag.valor != null ? Number(pag.valor) : null,
          pagoEm: pag.pagoEm,
          atualizadoEm: pag.atualizadoEm,
        }
      : null,
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
    return NextResponse.json(
      { erro: "Total do orçamento precisa ser maior que zero." },
      { status: 422 },
    );
  }

  const externalReference = `crm-${id}`;

  // Idempotencia: cobranca ativa ja existente para este negocio.
  const existente = await prisma.pagamento.findUnique({ where: { externalReference } });
  if (existente) {
    if (existente.status === "pago") {
      return NextResponse.json({
        ok: true,
        initPoint: existente.initPoint,
        status: "pago",
        referencia: existente.referencia,
        jaPago: true,
      });
    }
    // Pendente com o MESMO valor -> reaproveita o link (evita duplicar).
    if (
      existente.status === "pendente" &&
      existente.initPoint &&
      Number(existente.valor) === valor
    ) {
      return NextResponse.json({
        ok: true,
        initPoint: existente.initPoint,
        status: "pendente",
        referencia: existente.referencia,
        reaproveitado: true,
      });
    }
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
    referencia: id, // -> external_reference "crm-{id}" na Loja
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

  const extRef = cob.externalReference ?? externalReference;
  const pag = await prisma.pagamento.upsert({
    where: { externalReference: extRef },
    create: {
      negocioId: id,
      referencia: montagem.numeroFormatado,
      externalReference: extRef,
      valor,
      status: "pendente",
      mpPreferenceId: cob.preferenceId ?? null,
      initPoint: cob.initPoint,
    },
    update: {
      referencia: montagem.numeroFormatado,
      valor,
      status: "pendente",
      mpPreferenceId: cob.preferenceId ?? null,
      initPoint: cob.initPoint,
      // Regerou -> volta a pendente e limpa a data de pagamento antiga.
      pagoEm: null,
    },
  });

  return NextResponse.json({
    ok: true,
    initPoint: pag.initPoint,
    status: pag.status,
    referencia: pag.referencia,
  });
}

// Verificacao SOB DEMANDA do pagamento (Fase 3-B — Bloco 2). O webhook do MP pode
// nao chegar; este botao confirma o status na hora, consultando a Loja (que detem
// o token do MP). Escopo dono/admin. Idempotente (ja pago -> pago). Marca "pago"
// so quando o MP confirma approved. NAO toca Meta/conversao.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { checarAcessoNegocio } from "@/lib/orcamentoDados";
import { getIO } from "@/lib/socket";
import { consultarPagamento, consultarPorReferencia } from "@/lib/pagamentoLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;

  const acesso = await checarAcessoNegocio(agente, id);
  if (!acesso.ok) return NextResponse.json({ erro: acesso.erro }, { status: acesso.status });

  const externalReference = `crm-${id}`;
  const pagamento = await prisma.pagamento.findUnique({
    where: { externalReference },
    select: { id: true, negocioId: true, status: true, mpPaymentId: true, referencia: true },
  });
  if (!pagamento) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum link de pagamento foi gerado para este orçamento." },
      { status: 404 },
    );
  }

  // Idempotencia: ja pago -> nao reconsulta.
  if (pagamento.status === "pago") {
    return NextResponse.json({ ok: true, status: "pago", jaPago: true });
  }

  // Confirma no MP via Loja: por mpPaymentId (se o webhook ja trouxe) ou, quando
  // nao ha id (webhook nunca chegou), por external_reference (busca).
  const consulta = pagamento.mpPaymentId
    ? await consultarPagamento(pagamento.mpPaymentId)
    : await consultarPorReferencia(externalReference);

  if (!consulta.ok) {
    return NextResponse.json(
      { ok: false, erro: "Não foi possível verificar o pagamento agora. Tente novamente." },
      { status: 502 },
    );
  }

  // Nenhum pagamento encontrado no MP para esta referencia -> segue pendente.
  if (consulta.encontrado === false || !consulta.status) {
    return NextResponse.json({ ok: true, status: pagamento.status, encontrado: false });
  }

  const mpPaymentId = consulta.mpPaymentId ?? pagamento.mpPaymentId ?? null;

  if (consulta.status === "approved") {
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { status: "pago", pagoEm: new Date(), mpPaymentId },
    });
    getIO()?.emit("pagamento:atualizado", {
      negocioId: pagamento.negocioId,
      referencia: pagamento.referencia,
      status: "pago",
    });
    return NextResponse.json({ ok: true, status: "pago" });
  }

  if (consulta.status === "cancelled" || consulta.status === "rejected") {
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { status: "cancelado", mpPaymentId },
    });
    return NextResponse.json({ ok: true, status: "cancelado" });
  }

  // Pendente/em processamento: guarda o mpPaymentId (se veio) e segue pendente.
  if (mpPaymentId && mpPaymentId !== pagamento.mpPaymentId) {
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { mpPaymentId },
    });
  }
  return NextResponse.json({ ok: true, status: pagamento.status, mpStatus: consulta.status });
}

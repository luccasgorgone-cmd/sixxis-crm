// Webhook do Mercado Pago (Fase 3 — Bloco 4). O MP chama esta URL porque foi a
// notification_url da preferencia criada pela Loja para as cobrancas do CRM.
//
// AUTENTICIDADE (dupla):
//  1. x-signature (HMAC-sha256), quando MERCADOPAGO_WEBHOOK_SECRET estiver setado
//     — mesmo esquema do webhook da Loja (manifest id/request-id/ts). Assinatura
//     invalida -> 401. Sem secret -> segue (dev), pois o passo 2 ja e autoritativo.
//  2. Confirmacao AUTORITATIVA: o CRM NAO confia no corpo da notificacao — busca o
//     status real do pagamento no MP via Loja (consultarPagamento, read-only). So
//     marca "pago" se o MP disser approved E o external_reference casar com uma
//     cobranca local. Isso torna o fluxo self-securing mesmo sem o secret.
//
// IDEMPOTENCIA: cobranca ja "pago" nao reprocessa. TRAVA: nunca 500 sem corpo —
// sempre 200 { ok } para o MP nao reenviar (exceto assinatura invalida -> 401).
// NAO toca Meta/conversao/Sol/Oracle.
import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { consultarPagamento } from "@/lib/pagamentoLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";

// Valida a assinatura x-signature do MP (mesmo esquema do webhook da Loja).
function assinaturaValida(req: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return false;
  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";

  const parts: Record<string, string> = {};
  for (const seg of xSignature.split(",")) {
    const [k, v] = seg.trim().split("=");
    if (k && v) parts[k] = v;
  }
  if (!parts.ts || !parts.v1) return false;

  const dataId = req.nextUrl.searchParams.get("data.id") ?? "";
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
  const esperado = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(parts.v1, "utf8"),
      Buffer.from(esperado, "utf8"),
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Assinatura (defesa em profundidade) — so quando o secret esta configurado.
  if (WEBHOOK_SECRET && !assinaturaValida(req)) {
    console.warn("[mp:webhook-crm] assinatura invalida");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { type?: string; action?: string; data?: { id?: string | number } } | null = null;
  try {
    payload = await req.json();
  } catch {
    // Corpo invalido: 200 para o MP nao reenviar (nao ha o que processar).
    return NextResponse.json({ ok: true, ignorado: "corpo invalido" });
  }

  // So notificacoes de pagamento interessam.
  const tipo = payload?.type ?? payload?.action?.split(".")[0];
  const mpPaymentId = payload?.data?.id != null ? String(payload.data.id) : "";
  if (tipo !== "payment" || !mpPaymentId) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  try {
    // 2. Confirmacao autoritativa via Loja (read-only): status real no MP.
    const consulta = await consultarPagamento(mpPaymentId);
    if (!consulta.ok) {
      // Nao deu para confirmar agora (loja/MP indisponivel). 200 para nao entrar
      // em loop; o MP notifica de novo e ha reconciliacao posterior.
      console.warn(`[mp:webhook-crm] consulta indisponivel para ${mpPaymentId}`);
      return NextResponse.json({ ok: true, pendente: true });
    }

    const extRef = consulta.externalReference ?? "";
    if (!extRef || !extRef.startsWith("crm-")) {
      // Nao e uma cobranca do CRM (ex.: pagamento da propria Loja).
      return NextResponse.json({ ok: true, ignorado: true });
    }

    const pagamento = await prisma.pagamento.findUnique({
      where: { externalReference: extRef },
      select: { id: true, negocioId: true, status: true, referencia: true },
    });
    if (!pagamento) {
      return NextResponse.json({ ok: true, ignorado: true });
    }

    // 3. Idempotencia: ja pago -> nao reprocessa.
    if (pagamento.status === "pago") {
      return NextResponse.json({ ok: true, jaPago: true });
    }

    const aprovado = consulta.status === "approved";
    if (aprovado) {
      await prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { status: "pago", pagoEm: new Date(), mpPaymentId },
      });
      // Atualiza a UI (painel/aba) em tempo real. NAO toca Meta/conversao.
      getIO()?.emit("pagamento:atualizado", {
        negocioId: pagamento.negocioId,
        referencia: pagamento.referencia,
        status: "pago",
      });
      return NextResponse.json({ ok: true, status: "pago" });
    }

    // Estados negativos: registra o mpPaymentId e reflete cancelado quando aplicavel.
    if (consulta.status === "cancelled" || consulta.status === "rejected") {
      await prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { mpPaymentId, status: "cancelado" },
      });
      return NextResponse.json({ ok: true, status: "cancelado" });
    }

    // Pendente/em processamento: so guarda o mpPaymentId, segue pendente.
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { mpPaymentId },
    });
    return NextResponse.json({ ok: true, status: consulta.status ?? "pendente" });
  } catch (e) {
    // Nunca 500 sem corpo: loga e devolve 200 para o MP nao ficar reenviando.
    console.error("[mp:webhook-crm]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, tratado: false });
  }
}

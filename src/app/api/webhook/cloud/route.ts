// F4 — Webhook do WhatsApp Cloud API (oficial, Meta). DESLIGADO por padrao.
//
// Duas rotas, como a Meta exige:
//  GET  — verificacao da subscription: ecoa hub.challenge quando
//         hub.mode=subscribe E hub.verify_token casa com WHATSAPP_CLOUD_VERIFY_TOKEN.
//  POST — recebe eventos. Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo CRU
//         com o App Secret) ANTES de olhar o conteudo. Assinatura invalida -> 403.
//
// GATE: so PROCESSA (parseia) com CLOUD_API_ATIVO=true. Com a flag desligada
// (estado atual — nenhum numero no oficial ainda), responde 200 sem agir, pra um
// eventual ping da Meta nao dar erro nem entrar em loop de reentrega.
//
// A LIGACAO com a ingestao real (transformar as AcaoIngest do parse em
// conversa/negocio/roteamento) e o F5 — depende do piloto no numero conectado e
// de OK direto. Aqui, mesmo ligado, o parse so classifica e loga; nao despacha.
import { NextResponse, type NextRequest } from "next/server";
import {
  parseWebhookCloud,
  verificarAssinaturaCloud,
} from "@/lib/canal/cloudApiAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cloudAtivo(): boolean {
  return process.env.CLOUD_API_ATIVO === "true";
}

// GET: verificacao da subscription do webhook (handshake da Meta).
export async function GET(req: NextRequest): Promise<NextResponse | Response> {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const esperado = process.env.WHATSAPP_CLOUD_VERIFY_TOKEN;

  if (mode === "subscribe" && esperado && token === esperado && challenge) {
    // A Meta exige o challenge cru (text/plain), nao JSON.
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ erro: "verificacao falhou" }, { status: 403 });
}

// POST: eventos (mensagens, status). Valida assinatura sobre o corpo CRU.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const assinatura = req.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!verificarAssinaturaCloud(raw, assinatura, appSecret)) {
    console.warn("[cloud:webhook] assinatura invalida");
    return NextResponse.json({ erro: "assinatura invalida" }, { status: 403 });
  }

  // Flag desligada: reconhece sem processar (nenhum numero no oficial ainda).
  if (!cloudAtivo()) {
    return NextResponse.json({ ok: true, ignorado: "cloud-desativado" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignorado: "corpo-invalido" });
  }

  // Parse canonico (puro). O DESPACHO das acoes pra ingestao real e o F5.
  const acoes = parseWebhookCloud(payload);
  const resumo = acoes.reduce<Record<string, number>>((acc, a) => {
    acc[a.acao] = (acc[a.acao] ?? 0) + 1;
    return acc;
  }, {});
  console.info("[cloud:webhook] acoes parseadas (F4, sem despacho):", resumo);

  return NextResponse.json({ ok: true, parseadas: acoes.length });
}

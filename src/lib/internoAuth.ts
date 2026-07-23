// Autenticacao das rotas INTERNAS de entrada do CRM (Fatia AB): a Loja chama o
// CRM com o header x-internal-key. Valida contra STORE_INTERNAL_KEY (a MESMA
// chave ja usada pelo CRM para chamar a Loja — nao ha env nova) em tempo
// constante, no mesmo padrao dos webhooks evolution/mercadopago.
import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";

// no-store: nunca cachear respostas internas. noindex: nunca indexar.
const HEADERS_SEGUROS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

// Comparacao em tempo constante para evitar timing attacks no segredo.
function comparaSegredo(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Autorizado quando o header x-internal-key bate com STORE_INTERNAL_KEY.
export function autorizarInterno(req: NextRequest): boolean {
  const esperado = process.env.STORE_INTERNAL_KEY;
  if (!esperado) return false;
  const recebido = req.headers.get("x-internal-key") ?? "";
  return comparaSegredo(recebido, esperado);
}

// Resposta JSON das rotas internas: sempre com no-store + noindex.
export function jsonInterno(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: HEADERS_SEGUROS });
}

// 401 sem detalhe (nao revela o motivo).
export function naoAutorizadoInterno(): NextResponse {
  return jsonInterno({ erro: "nao autorizado" }, 401);
}

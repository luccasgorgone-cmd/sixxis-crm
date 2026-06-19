// Webhook da Evolution. Responsabilidade unica: validar o segredo, enfileirar
// o payload bruto e responder 200 IMEDIATAMENTE. Nenhum processamento aqui —
// quem decide o que fazer (inclusive ignorar) e o worker da fila.
import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { messagesQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Comparacao em tempo constante para evitar timing attacks no segredo.
function comparaSegredo(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const esperado = process.env.WEBHOOK_SECRET;

  // Segredo aceito via header "x-webhook-secret" ou query "secret".
  const recebido =
    req.headers.get("x-webhook-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    "";

  if (!esperado || !comparaSegredo(recebido, esperado)) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  // Le o corpo bruto e enfileira. Se nao for JSON valido, ainda responde 200
  // (nada a processar) para nao fazer a Evolution reentregar em loop.
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  await messagesQueue.add("evolution-event", payload);

  return NextResponse.json({ ok: true });
}

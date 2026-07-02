// Callback do OAuth do Mercado Livre (admin -> 403). Valida o state (cookie),
// troca o code por token (server-side) e redireciona para /google-trends com um
// parametro ?ml=<resultado>. try/catch, nunca vaza secret em log/resposta.
// GET /api/admin/integracoes/mercadolivre/callback?code=...&state=...
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { envML, trocarCodePorToken } from "@/lib/mercadolivre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_STATE = "ml_oauth_state";
const COOKIE_PATH = "/api/admin/integracoes/mercadolivre";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }

  const destino = new URL("/google-trends", req.nextUrl.origin);
  const limparCookie = (r: NextResponse) => {
    r.cookies.set(COOKIE_STATE, "", { path: COOKIE_PATH, maxAge: 0 });
    return r;
  };

  const env = envML();
  if (!env) {
    destino.searchParams.set("ml", "erro_config");
    return NextResponse.redirect(destino);
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get(COOKIE_STATE)?.value;

  // state ausente/divergente -> possivel CSRF; aborta sem trocar nada.
  if (!code || !state || !cookieState || state !== cookieState) {
    destino.searchParams.set("ml", "erro_state");
    return limparCookie(NextResponse.redirect(destino));
  }

  let ok = false;
  try {
    ok = await trocarCodePorToken(env, code);
  } catch {
    ok = false;
  }
  destino.searchParams.set("ml", ok ? "conectado" : "erro_token");
  return limparCookie(NextResponse.redirect(destino));
}

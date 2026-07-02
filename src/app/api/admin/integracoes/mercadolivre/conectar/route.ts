// Inicia o OAuth do Mercado Livre (admin -> 403). Gera um state anti-CSRF,
// guarda em cookie httpOnly e redireciona (302) para a tela de autorizacao do ML.
// Se faltar env do app, 503 com mensagem clara (sem vazar nada).
// GET /api/admin/integracoes/mercadolivre/conectar
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { envML, urlAutorizacao } from "@/lib/mercadolivre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_STATE = "ml_oauth_state";
const COOKIE_PATH = "/api/admin/integracoes/mercadolivre";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }
  const env = envML();
  if (!env) {
    return NextResponse.json(
      {
        erro:
          "Integracao nao configurada. Defina ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI no ambiente.",
      },
      { status: 503 },
    );
  }

  const state = crypto.randomUUID();
  const resp = NextResponse.redirect(urlAutorizacao(env, state));
  resp.cookies.set(COOKIE_STATE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: 600,
  });
  return resp;
}

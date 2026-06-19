// Middleware de autenticacao. Protege TODAS as rotas/paginas, exceto as
// publicas (login, callbacks do NextAuth, webhook da Evolution e health check).
// Sem sessao valida -> redireciona para /login preservando o destino.
// Usa apenas o auth.config (edge-safe), nunca o auth.ts (que tem Prisma/bcrypt).
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Prefixos liberados sem sessao.
const ROTAS_PUBLICAS = [
  "/login",
  "/api/auth",
  "/api/webhook/evolution",
  "/api/health",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const ehPublica = ROTAS_PUBLICAS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (ehPublica) return NextResponse.next();

  // Logado: segue. req.auth e a sessao (null quando deslogado).
  if (req.auth) return NextResponse.next();

  // Deslogado: manda para o login guardando para onde queria ir.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") {
    url.searchParams.set("callbackUrl", pathname);
  }
  return NextResponse.redirect(url);
});

export const config = {
  // Roda em tudo, menos assets estaticos do Next e arquivos com extensao.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};

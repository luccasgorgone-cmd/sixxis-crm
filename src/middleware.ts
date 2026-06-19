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

  // Deslogado: manda para o login guardando para onde queria ir.
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(url);
  }

  // Area administrativa: somente ADMIN. Vendedor -> 403 (API) ou /inbox (pagina).
  const ehRotaAdmin =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin");
  if (ehRotaAdmin && req.auth.user?.papel !== "ADMIN") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/inbox";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Roda em tudo, menos assets estaticos do Next e arquivos com extensao.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};

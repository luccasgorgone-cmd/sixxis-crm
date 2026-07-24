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
  // Rotas maquina-a-maquina do CRM (servidor da Loja, sem cookie de sessao).
  // Publicas aqui porque a autenticacao delas e o header x-internal-key com
  // timingSafeEqual (mesma abordagem do webhook da Evolution), que para
  // chamadas server-to-server e mais forte que sessao de navegador. NAO liberar
  // "/api/interno" inteiro: /api/interno/grupos e o chat da equipe e depende da
  // sessao. So o prefixo "/api/interno/crm". A checagem abaixo (pathname === p
  // || startsWith(`${p}/`)) ja cobre buscar-cliente, previa e aplicar.
  "/api/interno/crm",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const ehPublica = ROTAS_PUBLICAS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (ehPublica) return NextResponse.next();

  // Deslogado. Uma rota de API nunca deve responder com redirect de pagina: o
  // consumidor seguiria o redirect e receberia o HTML do /login com status 200,
  // transformando erro de autenticacao em resposta ilegivel e silenciosa. Para
  // /api/* respondemos 401 JSON; paginas continuam indo para /login.
  if (!req.auth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });
    }
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

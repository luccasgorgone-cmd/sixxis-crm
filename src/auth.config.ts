// Configuracao BASE do NextAuth, sem nada que dependa de Node (Prisma, bcrypt).
// Este arquivo e seguro para rodar no edge runtime do middleware. O provider
// Credentials (que usa Prisma+bcrypt) e adicionado so no auth.ts, usado pela
// rota de API que roda em Node.
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  // Pagina de login customizada da marca.
  pages: {
    signIn: "/login",
  },
  // Sessao via JWT (sem tabela de sessao no banco).
  session: {
    strategy: "jwt",
  },
  // Segredo explicito (a Railway seta NEXTAUTH_SECRET). trustHost: true e
  // necessario atras do proxy da Railway (host dinamico).
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  // Providers reais ficam no auth.ts; aqui vazio para o middleware edge.
  providers: [],
  callbacks: {
    // Copia os campos do dominio para o token no login.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.papel = user.papel;
        token.nome = user.name;
      }
      return token;
    },
    // Expoe os campos do token na sessao consumida pela UI/API.
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.papel = token.papel as typeof session.user.papel;
        session.user.name =
          (token.nome as string | null | undefined) ?? session.user.name;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

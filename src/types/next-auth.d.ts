// Augmenta os tipos do NextAuth para carregar os campos do nosso dominio
// (id, papel) na sessao e no token JWT. Sem isto, session.user.papel etc.
// nao existiriam no TypeScript.
import type { Papel } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      papel: Papel;
      acessoVenda: boolean;
      acessoPosVenda: boolean;
    } & DefaultSession["user"];
  }

  // Objeto retornado pelo authorize() do Credentials provider.
  interface User {
    papel: Papel;
    acessoVenda?: boolean;
    acessoPosVenda?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    papel: Papel;
    nome?: string | null;
    acessoVenda?: boolean;
    acessoPosVenda?: boolean;
  }
}

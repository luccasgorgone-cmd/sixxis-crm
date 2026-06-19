// Instancia completa do NextAuth v5, com o provider Credentials que valida
// email+senha contra a tabela Agente usando bcrypt. Roda em Node (a rota de
// API e o servidor importam daqui). NUNCA importar este arquivo no middleware
// (que e edge) — use o auth.config.ts la.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      // Campos do formulario de login.
      credentials: {
        email: { label: "Email", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const senha = String(credentials?.senha ?? "");
        if (!email || !senha) return null;

        const agente = await prisma.agente.findUnique({ where: { email } });
        // Sem agente, sem senha cadastrada ou inativo: nega.
        if (!agente || !agente.senha || !agente.ativo) return null;

        const ok = await bcrypt.compare(senha, agente.senha);
        if (!ok) return null;

        // Registra o ultimo login (best-effort, nao bloqueia o fluxo).
        await prisma.agente
          .update({
            where: { id: agente.id },
            data: { ultimoLogin: new Date() },
          })
          .catch(() => undefined);

        return {
          id: agente.id,
          name: agente.nome,
          email: agente.email,
          papel: agente.papel,
        };
      },
    }),
  ],
});

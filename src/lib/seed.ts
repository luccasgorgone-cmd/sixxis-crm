// Seed idempotente do agente ADMIN, executado no boot do servidor.
// Se nao existir Agente com email = ADMIN_EMAIL, cria um ADMIN com a senha
// (bcrypt) de ADMIN_SENHA. Se ja existir, garante que tem senha definida.
// Nunca derruba o boot: erros sao logados e engolidos.
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { Papel } from "../generated/prisma/enums";

export async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const senha = process.env.ADMIN_SENHA;

  if (!email || !senha) {
    console.warn(
      "[seed] ADMIN_EMAIL/ADMIN_SENHA ausentes; seed do admin ignorado",
    );
    return;
  }

  try {
    const existente = await prisma.agente.findUnique({ where: { email } });

    if (existente) {
      // Garante senha caso o registro tenha vindo de fases anteriores sem ela.
      if (!existente.senha) {
        const hash = await bcrypt.hash(senha, 10);
        await prisma.agente.update({
          where: { id: existente.id },
          data: { senha: hash, papel: Papel.ADMIN, ativo: true },
        });
        console.log("[seed] admin ok (senha definida)");
      } else {
        console.log("[seed] admin ok");
      }
      return;
    }

    const hash = await bcrypt.hash(senha, 10);
    await prisma.agente.create({
      data: {
        nome: "Administrador",
        email,
        senha: hash,
        papel: Papel.ADMIN,
        ativo: true,
      },
    });
    console.log("[seed] admin criado");
  } catch (erro) {
    console.error(
      `[seed] falha ao semear admin: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

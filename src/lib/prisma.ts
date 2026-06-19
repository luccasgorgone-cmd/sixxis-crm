// Singleton do PrismaClient. Na Prisma 7 (Rust-free) a conexao com o banco
// e feita por um driver adapter (PrismaPg) recebendo a connection string.
// O singleton via globalThis evita esgotar conexoes no hot-reload do dev.
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function criarPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? criarPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

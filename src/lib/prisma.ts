// Singleton do PrismaClient. Na Prisma 7 (Rust-free) a conexao com o banco
// e feita por um driver adapter (PrismaPg) recebendo a connection string.
// O singleton via globalThis evita esgotar conexoes no hot-reload do dev.
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Pool de conexoes do Postgres (node-postgres via PrismaPg). O default do `pg`
// e max=10 por processo; como tudo roda num processo so (Next + Socket.io +
// BullMQ), sob trafego as queries concorrentes ficavam na fila esperando
// conexao -> latencia. O Postgres da Railway permite 500 conexoes (so ~14 em
// uso), entao ha folga enorme: subimos para 25 (tunavel por DB_POOL_MAX).
function poolMax(): number {
  const n = Number(process.env.DB_POOL_MAX);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

function criarPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: poolMax(),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? criarPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

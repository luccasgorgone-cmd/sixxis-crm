// Conexao ioredis usada para checagens gerais (ex.: health check).
// maxRetriesPerRequest: null e exigencia do BullMQ e mantemos aqui por
// consistencia. O singleton via globalThis evita multiplas conexoes no dev.
import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: IORedis;
};

function criarRedis(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export const redis = globalForRedis.redis ?? criarRedis();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

// Conexao ioredis usada para checagens gerais (ex.: health check).
// IMPORTANTE: a conexao e criada SOB DEMANDA (getRedis), nunca no topo do
// modulo. Isso evita que o "next build" tente conectar no Redis em tempo de
// build (no Railway o Redis nem e alcancavel durante o build).
// lazyConnect: true => so conecta na primeira operacao (em runtime).
// maxRetriesPerRequest: null e exigencia do BullMQ; mantido por consistencia.
import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: IORedis;
};

export function getRedis(): IORedis {
  if (globalForRedis.redis) return globalForRedis.redis;

  const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  // Sem handler de 'error', um erro de conexao vira "unhandled error event"
  // e derruba o processo. Apenas logamos.
  redis.on("error", (err) => {
    console.error(`[redis] erro: ${err?.message}`);
  });

  globalForRedis.redis = redis;
  return redis;
}

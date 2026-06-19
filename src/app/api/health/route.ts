// Health check: verifica conectividade com o banco (Postgres) e o Redis.
// Retorna 200 se ambos respondem; 503 se algum falhar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  let db: "ok" | "erro" = "erro";
  let redisStatus: "ok" | "erro" = "erro";

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    db = "erro";
  }

  try {
    // Conexao Redis obtida sob demanda aqui dentro (runtime).
    const pong = await getRedis().ping();
    redisStatus = pong === "PONG" ? "ok" : "erro";
  } catch {
    redisStatus = "erro";
  }

  const tudoOk = db === "ok" && redisStatus === "ok";
  return NextResponse.json(
    { db, redis: redisStatus },
    { status: tudoOk ? 200 : 503 },
  );
}

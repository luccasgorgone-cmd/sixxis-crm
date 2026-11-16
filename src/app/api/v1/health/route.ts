// GET /api/v1/health  -> liveness/readiness. SEM auth (brief: health publico).
// { status, version, commit, time }. no-store. Nao toca banco (liveness barato);
// a prova de readiness do deploy e o /api/health legado (db/redis).
import { NextResponse } from "next/server";
import { VERSAO_API, commitDoDeploy } from "@/lib/api-v1/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const res = NextResponse.json({
    status: "ok",
    version: VERSAO_API,
    commit: commitDoDeploy(),
    time: new Date().toISOString(),
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

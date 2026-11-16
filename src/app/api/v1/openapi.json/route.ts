// GET /api/v1/openapi.json  -> especificacao OpenAPI 3.1 (gerada do registro).
// SO esquema/metadados (nenhum dado de negocio, nenhum segredo). Publico para o
// programa externo descobrir a API; gerado a cada request para refletir commit.
import { NextResponse } from "next/server";
import { gerarOpenApi } from "@/lib/api-v1/openapi";
import { infoBuild } from "@/lib/api-v1/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const res = NextResponse.json(gerarOpenApi(infoBuild()));
  res.headers.set("Cache-Control", "no-store");
  return res;
}

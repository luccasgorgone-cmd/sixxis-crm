// GET /api/v1/docs  -> documentacao interativa (Scalar) apontando pro
// openapi.json. Publico (so renderiza o esquema). text/html.
import { NextResponse } from "next/server";
import { htmlDocs } from "@/lib/api-v1/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(htmlDocs(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

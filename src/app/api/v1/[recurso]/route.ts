// GET /api/v1/<recurso>  -> lista paginada (envelope + cursor).
// Metodos que mutam -> 405 problem+json (garantia read-only). OPTIONS -> 204.
import type { NextRequest } from "next/server";
import { handlerLista, handlerMetodoNaoPermitido, handlerOptions } from "@/lib/api-v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ recurso: string }> }) {
  const { recurso } = await params;
  return handlerLista(req, recurso);
}

export const POST = handlerMetodoNaoPermitido;
export const PUT = handlerMetodoNaoPermitido;
export const PATCH = handlerMetodoNaoPermitido;
export const DELETE = handlerMetodoNaoPermitido;
export const OPTIONS = handlerOptions;

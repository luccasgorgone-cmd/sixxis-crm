// GET /api/v1/<recurso>/{id}  -> item unico (ou 404). Soft-delete some por padrao.
// Metodos que mutam -> 405 problem+json. OPTIONS -> 204.
import type { NextRequest } from "next/server";
import { handlerItem, handlerMetodoNaoPermitido, handlerOptions } from "@/lib/api-v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ recurso: string; id: string }> }) {
  const { recurso, id } = await params;
  return handlerItem(req, recurso, id);
}

export const POST = handlerMetodoNaoPermitido;
export const PUT = handlerMetodoNaoPermitido;
export const PATCH = handlerMetodoNaoPermitido;
export const DELETE = handlerMetodoNaoPermitido;
export const OPTIONS = handlerOptions;

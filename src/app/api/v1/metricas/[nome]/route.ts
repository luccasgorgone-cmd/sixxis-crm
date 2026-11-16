// GET /api/v1/metricas/<nome>  -> KPI agregado (de/ate/agrupar). Exige
// read:analytics (ou read:all). Fuso dos recortes: America/Sao_Paulo.
import type { NextRequest } from "next/server";
import { handlerMetrica, handlerMetodoNaoPermitido, handlerOptions } from "@/lib/api-v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  return handlerMetrica(req, nome);
}

export const POST = handlerMetodoNaoPermitido;
export const PUT = handlerMetodoNaoPermitido;
export const PATCH = handlerMetodoNaoPermitido;
export const DELETE = handlerMetodoNaoPermitido;
export const OPTIONS = handlerOptions;

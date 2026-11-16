// GET /api/v1/metricas  -> lista as metricas disponiveis (descoberta). Exige
// read:analytics (ou read:all), igual aos KPIs em si.
import type { NextRequest } from "next/server";
import { handlerTransversal, handlerMetodoNaoPermitido, handlerOptions } from "@/lib/api-v1/handler";
import { listarMetricas } from "@/lib/api-v1/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return handlerTransversal(
    req,
    () => ({
      escopo: "read:analytics",
      parametros: ["de (ISO)", "ate (ISO)", "agrupar=dia|semana|mes"],
      fuso: "America/Sao_Paulo",
      disponiveis: listarMetricas().map((nome) => ({ nome, caminho: `/api/v1/metricas/${nome}` })),
    }),
    "read:analytics",
  );
}

export const POST = handlerMetodoNaoPermitido;
export const PUT = handlerMetodoNaoPermitido;
export const PATCH = handlerMetodoNaoPermitido;
export const DELETE = handlerMetodoNaoPermitido;
export const OPTIONS = handlerOptions;

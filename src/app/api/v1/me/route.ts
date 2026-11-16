// GET /api/v1/me  -> informacoes da chave autenticada (nunca o token em claro).
// Util para o programa externo descobrir seus escopos e validade.
import type { NextRequest } from "next/server";
import { handlerTransversal, handlerMetodoNaoPermitido, handlerOptions } from "@/lib/api-v1/handler";
import { podeVerPii, podeVerMensagens } from "@/lib/api-v1/escopos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return handlerTransversal(req, (chave) => ({
    id: chave.id,
    nome: chave.nome,
    prefixo: chave.prefixo,
    escopos: chave.escopos,
    expiraEm: chave.expiraEm ? chave.expiraEm.toISOString() : null,
    podeVerPii: podeVerPii(chave.escopos),
    podeVerMensagens: podeVerMensagens(chave.escopos),
  }));
}

export const POST = handlerMetodoNaoPermitido;
export const PUT = handlerMetodoNaoPermitido;
export const PATCH = handlerMetodoNaoPermitido;
export const DELETE = handlerMetodoNaoPermitido;
export const OPTIONS = handlerOptions;

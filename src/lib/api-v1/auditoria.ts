// Log de auditoria por requisicao -> tabela ApiLogAcesso.
// REGRAS DE PRIVACIDADE:
//  - NUNCA grava a chave (so o prefixo nao-secreto e o id da chave).
//  - NUNCA grava PII no query string: o valor de 'q' (busca livre, pode conter
//    nome/telefone) e redigido antes de persistir.
//  - Falha de log NUNCA derruba a requisicao (best-effort, erro so no console).

import { prisma } from "@/lib/prisma";

// Parametros cujo VALOR pode conter PII e deve ser redigido no log.
const PARAMS_SENSIVEIS = new Set(["q"]);

export function sanitizarQuery(query: string | null | undefined): string | null {
  if (!query) return null;
  const limpo = query.startsWith("?") ? query.slice(1) : query;
  if (!limpo) return null;
  const sp = new URLSearchParams(limpo);
  const saida = new URLSearchParams();
  for (const [k, v] of sp.entries()) {
    saida.set(k, PARAMS_SENSIVEIS.has(k) ? "[redigido]" : v);
  }
  const s = saida.toString();
  return s.length ? s.slice(0, 2000) : null;
}

export interface EntradaAuditoria {
  chaveId?: string | null;
  prefixo?: string | null;
  metodo: string;
  rota: string;
  query?: string | null;
  status: number;
  duracaoMs: number;
  ip?: string | null;
  userAgent?: string | null;
  requestId: string;
}

// Best-effort: nao aguardar no caminho critico; nunca lanca.
export async function registrarAcesso(entrada: EntradaAuditoria): Promise<void> {
  try {
    await prisma.apiLogAcesso.create({
      data: {
        chaveId: entrada.chaveId ?? null,
        prefixo: entrada.prefixo ?? null,
        metodo: entrada.metodo,
        rota: entrada.rota.slice(0, 500),
        query: sanitizarQuery(entrada.query),
        status: entrada.status,
        duracaoMs: Math.max(0, Math.round(entrada.duracaoMs)),
        ip: entrada.ip ?? null,
        userAgent: entrada.userAgent ? entrada.userAgent.slice(0, 500) : null,
        requestId: entrada.requestId,
      },
    });
  } catch (err) {
    console.error("[api-v1] falha ao registrar auditoria:", err);
  }
}

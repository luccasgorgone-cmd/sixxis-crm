// Autenticacao Bearer da API v1, independente do NextAuth do app.
//
// Fluxo: Authorization: Bearer sxc_live_... -> SHA-256 hex -> lookup por hash
// (indice unico) -> valida revogacao/expiracao -> constant-time compare ->
// atualiza ultimoUsoEm/ultimoIp (no maximo 1x/min por chave).
//
// NUNCA guardamos a chave em claro; so o hash. O prefixo e so para exibir.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ChaveAutenticada } from "./tipos";
import { naoAutenticado, limiteExcedido } from "./erros";
import { registrarFalhaAuth } from "./rate-limit";

export const PREFIXO_CHAVE = "sxc_live_";
// Quantos chars do token viram o "prefixo" exibivel (sxc_live_ + 8 chars).
const TAM_PREFIXO_EXIBICAO = PREFIXO_CHAVE.length + 8;
// So reescreve ultimoUsoEm se o ultimo uso foi ha mais de isto (ms).
const INTERVALO_ULTIMO_USO_MS = 60_000;

export function hashChave(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function prefixoDe(token: string): string {
  return token.slice(0, TAM_PREFIXO_EXIBICAO);
}

// Gera uma nova chave (usado pela CLI). Retorna o token EM CLARO (so aqui) +
// o hash e o prefixo para persistir. >= 32 bytes de entropia.
export function gerarChave(): { token: string; hash: string; prefixo: string } {
  const bruto = randomBytes(32).toString("base64url");
  const token = PREFIXO_CHAVE + bruto;
  return { token, hash: hashChave(token), prefixo: prefixoDe(token) };
}

function comparaConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function extrairBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const token = m[1].trim();
  return token.length > 0 ? token : null;
}

// Conta a falha de auth no contador por IP e lanca 401 — ou 429 (Retry-After) se
// o IP ja estourou o limite de falhas na janela (anti brute-force de chaves).
// Todas as falhas de autenticacao passam por aqui.
async function falhaAutenticacao(ip: string | null): Promise<never> {
  const r = await registrarFalhaAuth(ip);
  if (r.excedido) {
    throw limiteExcedido(
      r.resetSeg,
      "Muitas falhas de autenticacao deste IP. Tente novamente mais tarde.",
    );
  }
  throw naoAutenticado();
}

// Autentica a requisicao. Lanca ProblemaApi(401) em qualquer falha (sem revelar
// qual: ausente/invalida/revogada/expirada dao a mesma resposta generica); apos
// muitas falhas do mesmo IP na janela, responde 429.
export async function autenticar(authorization: string | null, ip: string | null): Promise<ChaveAutenticada> {
  const token = extrairBearer(authorization);
  if (!token || !token.startsWith(PREFIXO_CHAVE)) return falhaAutenticacao(ip);

  const hash = hashChave(token);
  const row = await prisma.apiChaveLeitura.findUnique({
    where: { hash },
    select: {
      id: true,
      nome: true,
      prefixo: true,
      hash: true,
      escopos: true,
      expiraEm: true,
      revogadoEm: true,
      ultimoUsoEm: true,
    },
  });
  if (!row) return falhaAutenticacao(ip);
  // Defesa extra (constant-time) — o lookup ja foi por igualdade de hash.
  if (!comparaConstante(hash, row.hash)) return falhaAutenticacao(ip);
  if (row.revogadoEm) return falhaAutenticacao(ip);
  if (row.expiraEm && row.expiraEm.getTime() <= Date.now()) return falhaAutenticacao(ip);

  // Atualiza ultimo uso de forma throttled (no maximo 1x/min por chave).
  const agora = Date.now();
  const precisaAtualizar = !row.ultimoUsoEm || agora - row.ultimoUsoEm.getTime() > INTERVALO_ULTIMO_USO_MS;
  if (precisaAtualizar) {
    try {
      await prisma.apiChaveLeitura.update({
        where: { id: row.id },
        data: { ultimoUsoEm: new Date(), ...(ip ? { ultimoIp: ip } : {}) },
      });
    } catch {
      // uso/ip e best-effort; nunca derruba a requisicao de leitura.
    }
  }

  return {
    id: row.id,
    nome: row.nome,
    prefixo: row.prefixo,
    escopos: row.escopos,
    expiraEm: row.expiraEm,
  };
}

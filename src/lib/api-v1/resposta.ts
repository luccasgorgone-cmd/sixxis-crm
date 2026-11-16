// Construcao de respostas HTTP da API v1: envelopes, X-Request-Id, no-store,
// problem+json. CORS fica DESLIGADO (nenhum header Access-Control-*).

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { API_VERSION, type MetaItem, type MetaLista } from "./tipos";
import { ProblemaApi, erroInterno } from "./erros";

export function gerarRequestId(): string {
  return randomUUID();
}

function aplicarBase(res: NextResponse, requestId: string, extra?: Record<string, string>): NextResponse {
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Content-Type-Options", "nosniff");
  if (extra) for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

export function metaLista(opts: {
  requestId: string;
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
}): MetaLista {
  return {
    requestId: opts.requestId,
    count: opts.count,
    hasMore: opts.hasMore,
    nextCursor: opts.nextCursor,
    generatedAt: new Date().toISOString(),
    apiVersion: API_VERSION,
  };
}

export function metaItem(requestId: string): MetaItem {
  return { requestId, generatedAt: new Date().toISOString(), apiVersion: API_VERSION };
}

export function respostaLista(
  data: unknown[],
  meta: MetaLista,
  requestId: string,
  extraHeaders?: Record<string, string>,
): NextResponse {
  const res = NextResponse.json({ data, meta });
  return aplicarBase(res, requestId, extraHeaders);
}

export function respostaItem(data: unknown, requestId: string, extraHeaders?: Record<string, string>): NextResponse {
  const res = NextResponse.json({ data, meta: metaItem(requestId) });
  return aplicarBase(res, requestId, extraHeaders);
}

// Resposta JSON crua (health, openapi, me, catalogo, metricas): mesmo envelope
// de cabecalhos, corpo livre.
export function respostaJson(corpo: unknown, requestId: string, extraHeaders?: Record<string, string>): NextResponse {
  const res = NextResponse.json(corpo);
  return aplicarBase(res, requestId, extraHeaders);
}

export function respostaProblema(problema: ProblemaApi, requestId: string, instance?: string): NextResponse {
  const corpo = problema.paraJson(requestId, instance);
  const res = NextResponse.json(corpo, { status: problema.status });
  res.headers.set("Content-Type", "application/problem+json; charset=utf-8");
  return aplicarBase(res, requestId, problema.headers);
}

// 304 Not Modified (ETag/If-None-Match): sem corpo, mantem X-Request-Id/no-store.
export function respostaNaoModificado(requestId: string, etag: string): NextResponse {
  const res = new NextResponse(null, { status: 304 });
  res.headers.set("ETag", etag);
  return aplicarBase(res, requestId);
}

// Converte qualquer erro em uma resposta problem+json. ProblemaApi -> como esta;
// qualquer outro -> 500 generico (NUNCA vaza stack/detalhe interno no corpo).
export function respostaErro(err: unknown, requestId: string, instance?: string): NextResponse {
  if (err instanceof ProblemaApi) return respostaProblema(err, requestId, instance);
  return respostaProblema(erroInterno(), requestId, instance);
}

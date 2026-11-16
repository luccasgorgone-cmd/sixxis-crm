// Handler generico da API de Leitura v1: orquestra o pipeline de uma requisicao
// de leitura (lista ou item) de ponta a ponta, identico para todos os recursos.
//
// Pipeline (nessa ordem, falha cedo):
//   1. gerar requestId, ler ip/userAgent, iniciar cronometro
//   2. autenticar (Bearer -> ProblemaApi 401)
//   3. escopo do recurso (podeLerRecurso -> 403)
//   4. rate limit por chave (-> 429 + Retry-After)
//   5. montar plano de consulta a partir da URL (-> 400 em entrada invalida)
//   6. Prisma findMany/findUnique com `select` da allowlist (anti-vazamento)
//   7. serializar aplicando mascara PII / gate de mensagens
//   8. responder (envelope + X-Request-Id + no-store + headers de rate limit)
//   9. auditar (best-effort, sem PII, nunca derruba a resposta)
//
// Qualquer erro vira problem+json via respostaErro (nunca vaza stack/detalhe).

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ChaveAutenticada, Recurso } from "./tipos";
import { recursoPorNome } from "./registro";
import { autenticar } from "./auth";
import { verificarRateLimit, cabecalhosRateLimit } from "./rate-limit";
import { podeLerRecurso, podeVerPii, podeVerMensagens } from "./escopos";
import { ipDaRequisicao, userAgentDe } from "./requisicao";
import { montarPlano, montarSelecao, proximoCursor } from "./consulta";
import { selecaoPrisma, serializarItem } from "./serializar";
import {
  gerarRequestId,
  metaLista,
  respostaLista,
  respostaItem,
  respostaJson,
  respostaErro,
  respostaProblema,
} from "./resposta";
import { ESCOPO_TUDO } from "./escopos";
import {
  proibido,
  naoEncontrado,
  naoAutenticado,
  limiteExcedido,
  metodoNaoPermitido,
  requisicaoInvalida,
} from "./erros";

// Delegate Prisma acessado por nome de model (ex.: prisma["lead"]). O select e
// sempre a allowlist do recurso, entao esse acesso dinamico nao amplia exposicao.
type DelegatePrisma = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
};

function delegateDe(model: string): DelegatePrisma {
  const d = (prisma as unknown as Record<string, DelegatePrisma>)[model];
  if (!d || typeof d.findMany !== "function") {
    // Erro de registro (model inexistente): 500 generico, nunca expoe o nome.
    throw new Error(`model Prisma inexistente para o recurso: ${model}`);
  }
  return d;
}

function lerBoolParam(valor: string | null): boolean {
  return valor === "true" || valor === "1";
}

// Metadados comuns extraidos no inicio de qualquer requisicao.
function abrir(req: NextRequest): {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  inicio: number;
  rota: string;
  query: string;
} {
  return {
    requestId: gerarRequestId(),
    ip: ipDaRequisicao(req.headers),
    userAgent: userAgentDe(req.headers),
    inicio: Date.now(),
    rota: req.nextUrl.pathname,
    query: req.nextUrl.search,
  };
}

// Autentica + aplica rate limit (sem checar escopo de recurso). Base comum do
// prelude de recursos e das rotas transversais. Lanca ProblemaApi.
async function autenticarComRate(
  authorization: string | null,
  ip: string | null,
): Promise<{ chave: ChaveAutenticada; rateHeaders: Record<string, string> }> {
  const chave = await autenticar(authorization, ip);
  const rate = await verificarRateLimit(chave.id);
  const rateHeaders = cabecalhosRateLimit(rate);
  if (!rate.permitido) throw limiteExcedido(rate.resetSeg);
  return { chave, rateHeaders };
}

// Prelude compartilhado dos recursos: autentica + rate limit + checa escopo do
// recurso. Lanca ProblemaApi. Retorna a chave e os headers de rate limit.
async function autorizar(
  authorization: string | null,
  ip: string | null,
  recurso: Recurso,
): Promise<{ chave: ChaveAutenticada; rateHeaders: Record<string, string> }> {
  const chave = await autenticar(authorization, ip);
  if (!podeLerRecurso(chave.escopos, recurso.escopo)) {
    throw proibido(`A chave nao possui o escopo '${recurso.escopo}' (nem read:all) para ler '${recurso.nome}'.`);
  }
  const rate = await verificarRateLimit(chave.id);
  const rateHeaders = cabecalhosRateLimit(rate);
  if (!rate.permitido) throw limiteExcedido(rate.resetSeg);
  return { chave, rateHeaders };
}

// Registra o acesso de forma best-effort (import tardio para nao acoplar o
// caminho de erro de modulo). Nunca lanca.
async function auditar(entrada: {
  chave?: ChaveAutenticada;
  rota: string;
  query: string;
  status: number;
  inicio: number;
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}): Promise<void> {
  try {
    const { registrarAcesso } = await import("./auditoria");
    await registrarAcesso({
      chaveId: entrada.chave?.id ?? null,
      prefixo: entrada.chave?.prefixo ?? null,
      metodo: "GET",
      rota: entrada.rota,
      query: entrada.query,
      status: entrada.status,
      duracaoMs: Date.now() - entrada.inicio,
      ip: entrada.ip,
      userAgent: entrada.userAgent,
      requestId: entrada.requestId,
    });
  } catch {
    // auditoria.registrarAcesso ja e best-effort; este catch so cobre o import.
  }
}

function anexarHeaders(res: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

// --- LISTA ------------------------------------------------------------------
// GET /api/v1/<recurso>
export async function handlerLista(req: NextRequest, nomeRecurso: string): Promise<NextResponse> {
  const recurso = recursoPorNome(nomeRecurso);
  if (!recurso) return responderRecursoInexistente(req);

  const ctx = abrir(req);
  let res: NextResponse;
  let chave: ChaveAutenticada | undefined;
  let rateHeaders: Record<string, string> = {};

  try {
    const auth = await autorizar(req.headers.get("authorization"), ctx.ip, recurso);
    chave = auth.chave;
    rateHeaders = auth.rateHeaders;

    const plano = montarPlano(recurso, req.nextUrl.searchParams);
    const select = selecaoPrisma(recurso, { fields: plano.fields, expand: plano.expand });
    const linhas = await delegateDe(recurso.model).findMany({
      where: plano.where,
      orderBy: plano.orderBy,
      take: plano.take,
      select,
    });

    const hasMore = linhas.length > plano.limite;
    const pagina = hasMore ? linhas.slice(0, plano.limite) : linhas;
    const ctxSer = {
      podePii: podeVerPii(chave.escopos),
      podeMensagens: podeVerMensagens(chave.escopos),
      fields: plano.fields,
      expand: plano.expand,
    };
    const data = pagina.map((l) => serializarItem(recurso, l, ctxSer));
    const nextCursor =
      hasMore && pagina.length > 0
        ? proximoCursor(recurso, pagina[pagina.length - 1], plano.colunaOrdenacao)
        : null;

    const meta = metaLista({ requestId: ctx.requestId, count: data.length, hasMore, nextCursor });
    res = respostaLista(data, meta, ctx.requestId, rateHeaders);
  } catch (err) {
    res = anexarHeaders(respostaErro(err, ctx.requestId, ctx.rota), rateHeaders);
  }

  await auditar({ chave, status: res.status, ...ctx });
  return res;
}

// --- ITEM -------------------------------------------------------------------
// GET /api/v1/<recurso>/{id}
export async function handlerItem(req: NextRequest, nomeRecurso: string, id: string): Promise<NextResponse> {
  const recurso = recursoPorNome(nomeRecurso);
  if (!recurso) return responderRecursoInexistente(req);

  const ctx = abrir(req);
  let res: NextResponse;
  let chave: ChaveAutenticada | undefined;
  let rateHeaders: Record<string, string> = {};

  try {
    const auth = await autorizar(req.headers.get("authorization"), ctx.ip, recurso);
    chave = auth.chave;
    rateHeaders = auth.rateHeaders;

    const { fields, expand } = montarSelecao(recurso, req.nextUrl.searchParams);
    const select = selecaoPrisma(recurso, { fields, expand });
    const linha = await delegateDe(recurso.model).findUnique({ where: { id }, select });

    if (!linha) throw naoEncontrado(`Nenhum '${recurso.nome}' com id '${id}'.`);

    // Soft-delete: por padrao, item excluido responde 404 (como se nao existisse).
    const incluirExcluidos = lerBoolParam(req.nextUrl.searchParams.get("incluirExcluidos"));
    if (recurso.softDelete && !incluirExcluidos && linha[recurso.softDelete] === true) {
      throw naoEncontrado(`Nenhum '${recurso.nome}' com id '${id}'.`);
    }

    const ctxSer = {
      podePii: podeVerPii(chave.escopos),
      podeMensagens: podeVerMensagens(chave.escopos),
      fields,
      expand,
    };
    const data = serializarItem(recurso, linha, ctxSer);
    res = respostaItem(data, ctx.requestId, rateHeaders);
  } catch (err) {
    res = anexarHeaders(respostaErro(err, ctx.requestId, ctx.rota), rateHeaders);
  }

  await auditar({ chave, status: res.status, ...ctx });
  return res;
}

// Recurso de rota desconhecido: 404 problem+json (sem auditar — nem autenticou).
function responderRecursoInexistente(req: NextRequest): NextResponse {
  const requestId = gerarRequestId();
  return respostaProblema(naoEncontrado("Recurso desconhecido."), requestId, req.nextUrl.pathname);
}

// --- GUARDA READ-ONLY -------------------------------------------------------
// Qualquer metodo que muta -> 405 problem+json com Allow. As route files
// exportam esses handlers para POST/PUT/PATCH/DELETE.
const METODOS_PERMITIDOS = ["GET", "HEAD", "OPTIONS"];

export function handlerMetodoNaoPermitido(req: NextRequest): NextResponse {
  const requestId = gerarRequestId();
  return respostaProblema(metodoNaoPermitido(METODOS_PERMITIDOS), requestId, req.nextUrl.pathname);
}

// OPTIONS: 204 anunciando os metodos read-only (sem CORS).
export function handlerOptions(): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Allow", METODOS_PERMITIDOS.join(", "));
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// --- TRANSVERSAIS (auth, sem select de recurso) -----------------------------
// Autentica + rate limit e delega a `fn(chave)` a montagem do corpo JSON.
// Usada por /me e /meta/recursos. `escopoExigido` opcional (ex.: metricas pedem
// read:analytics). Audita best-effort.
export async function handlerTransversal(
  req: NextRequest,
  fn: (chave: ChaveAutenticada) => Promise<unknown> | unknown,
  escopoExigido?: string,
): Promise<NextResponse> {
  const ctx = abrir(req);
  let res: NextResponse;
  let chave: ChaveAutenticada | undefined;
  let rateHeaders: Record<string, string> = {};

  try {
    const auth = await autenticarComRate(req.headers.get("authorization"), ctx.ip);
    chave = auth.chave;
    rateHeaders = auth.rateHeaders;
    if (escopoExigido && !chave.escopos.includes(ESCOPO_TUDO) && !chave.escopos.includes(escopoExigido)) {
      throw proibido(`A chave nao possui o escopo '${escopoExigido}' (nem read:all).`);
    }
    const corpo = await fn(chave);
    res = respostaJson(corpo, ctx.requestId, rateHeaders);
  } catch (err) {
    res = anexarHeaders(respostaErro(err, ctx.requestId, ctx.rota), rateHeaders);
  }

  await auditar({ chave, status: res.status, ...ctx });
  return res;
}

// GET /api/v1/metricas/<nome> — KPI agregado. Exige read:analytics (ou read:all).
export async function handlerMetrica(req: NextRequest, nome: string): Promise<NextResponse> {
  return handlerTransversal(
    req,
    async () => {
      const { executarMetrica } = await import("./metricas");
      return executarMetrica(nome, {
        de: req.nextUrl.searchParams.get("de"),
        ate: req.nextUrl.searchParams.get("ate"),
        agrupar: req.nextUrl.searchParams.get("agrupar"),
      });
    },
    "read:analytics",
  );
}

// Reexport usado por rotas transversais que querem sinalizar 401 cedo.
export { naoAutenticado, requisicaoInvalida };

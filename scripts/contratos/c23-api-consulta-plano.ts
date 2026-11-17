// Contrato dourado C23 — plano de consulta da API de Leitura v1.
//   npx tsx scripts/contratos/c23-api-consulta-plano.ts
//
// Trava o comportamento publico de montarPlano (puro, sem banco/rede):
//   #1/#2  Tabela "grande" aceita a 1a pagina SEM filtro (so limit): a consulta
//          e sempre keyset (take = limite+1, limite <= 500), nunca varredura.
//          Vale inclusive para recursos ordenados por "id" (ex.: campanha-destinos),
//          que antes so aceitavam cursor.
//   #3     limit fora de 1..500 -> 400 (nunca clamp silencioso), batendo com o
//          'maximum' declarado no OpenAPI.
//   #4     limiteExcedido aceita detail custom e carrega 429 + Retry-After
//          (usado pelo throttle de falhas de auth por IP).
// Prova PURA (sem banco/rede).
import assert from "node:assert";
import { montarPlano, LIMITE_MAX, LIMITE_PADRAO } from "../../src/lib/api-v1/consulta";
import { recursoPorNome } from "../../src/lib/api-v1/registro";
import { ProblemaApi, limiteExcedido } from "../../src/lib/api-v1/erros";
import type { Recurso } from "../../src/lib/api-v1/tipos";

let ok = 0;
let falhou = 0;
function caso(nome: string, fn: () => void): void {
  try {
    fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhou++;
    console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function recurso(nome: string): Recurso {
  const r = recursoPorNome(nome);
  assert.ok(r, `recurso de teste '${nome}' precisa existir no registro`);
  assert.ok(r!.grande === true, `recurso de teste '${nome}' precisa ser 'grande'`);
  return r!;
}

function q(s: string): URLSearchParams {
  return new URLSearchParams(s);
}

function status400(fn: () => unknown): number {
  try {
    fn();
    throw new Error("esperava ProblemaApi 400, mas nao lancou");
  } catch (e) {
    if (!(e instanceof ProblemaApi)) throw e;
    return e.status;
  }
}

// --- #1: grande com coluna de data (leads) aceita 1a pagina sem filtro -------
caso("#1 leads (grande, criadoEm) sem filtro -> plano keyset, nao lanca", () => {
  const plano = montarPlano(recurso("leads"), q(""));
  assert.equal(plano.limite, LIMITE_PADRAO);
  assert.equal(plano.take, LIMITE_PADRAO + 1); // +1 para detectar hasMore
  assert.ok(Array.isArray(plano.orderBy) && plano.orderBy.length >= 1);
});

// --- #2: grande ordenado por "id" (campanha-destinos) tambem libera 1a pagina -
caso("#2 campanha-destinos (grande, ordena por id) sem filtro -> nao lanca", () => {
  const r = recurso("campanha-destinos");
  assert.equal(r.campoOrdenacao, "id"); // pre-condicao que motivava o #2
  const plano = montarPlano(r, q("limit=50"));
  assert.equal(plano.limite, 50);
  assert.equal(plano.take, 51);
  assert.equal(plano.colunaOrdenacao, "id");
  // orderBy estavel por id (tie-break determinista para o cursor keyset).
  assert.deepEqual(plano.orderBy, [{ id: "asc" }]);
});

// --- #3: limit fora da faixa 1..500 -> 400 (sem clamp) -----------------------
caso("#3 limit=999 -> 400 (nao clampa para 500)", () => {
  assert.equal(status400(() => montarPlano(recurso("leads"), q("limit=999"))), 400);
});
caso(`#3 limit=${LIMITE_MAX} (teto) -> ok`, () => {
  const plano = montarPlano(recurso("leads"), q(`limit=${LIMITE_MAX}`));
  assert.equal(plano.limite, LIMITE_MAX);
  assert.equal(plano.take, LIMITE_MAX + 1);
});
caso("#3 limit=0 -> 400", () => {
  assert.equal(status400(() => montarPlano(recurso("leads"), q("limit=0"))), 400);
});
caso("#3 limit=1 -> ok", () => {
  assert.equal(montarPlano(recurso("leads"), q("limit=1")).limite, 1);
});
caso("#3 limit=501 (teto+1) -> 400", () => {
  assert.equal(status400(() => montarPlano(recurso("leads"), q(`limit=${LIMITE_MAX + 1}`))), 400);
});

// --- #4: 429 de falha de auth por IP carrega detail custom + Retry-After -----
caso("#4 limiteExcedido(detail) -> 429 + Retry-After + detail custom", () => {
  const p = limiteExcedido(42, "Muitas falhas de autenticacao deste IP. Tente novamente mais tarde.");
  assert.equal(p.status, 429);
  assert.equal(p.headers["Retry-After"], "42");
  assert.match(p.detail ?? "", /falhas de autenticacao/);
});
caso("#4 limiteExcedido() sem detail mantem mensagem padrao (compat)", () => {
  const p = limiteExcedido(30);
  assert.equal(p.status, 429);
  assert.equal(p.headers["Retry-After"], "30");
  assert.ok((p.detail ?? "").length > 0);
});

console.log(`\nC23 API plano de consulta (#1 1a-pagina grande, #2 ordena-id, #3 limit 1..500, #4 429): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

// Contrato dourado C22 — garantia read-only (405) + envelope de erro RFC 9457.
//   npx tsx scripts/contratos/c22-api-readonly-erros.ts
//
// Regra: a API v1 e read-only. Qualquer metodo de escrita (POST/PUT/PATCH/
// DELETE) responde 405 com header Allow so de leitura. Erros seguem RFC 9457
// (application/problem+json): type/title/status + requestId, headers corretos
// (WWW-Authenticate no 401, Retry-After no 429). Prova PURA (sem banco/rede).
import assert from "node:assert";
import {
  metodoNaoPermitido,
  naoAutenticado,
  proibido,
  requisicaoInvalida,
  limiteExcedido,
  naoEncontrado,
  ProblemaApi,
} from "../../src/lib/api-v1/erros";

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

const LEITURA = ["GET", "HEAD", "OPTIONS"];

caso("metodoNaoPermitido = 405 com Allow so de leitura", () => {
  const p = metodoNaoPermitido(LEITURA);
  assert.equal(p.status, 405);
  assert.equal(p.headers.Allow, "GET, HEAD, OPTIONS");
  // Nenhum metodo de escrita no Allow.
  for (const escrita of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!p.headers.Allow.includes(escrita), `Allow nao pode conter ${escrita}`);
  }
});

caso("401 carrega WWW-Authenticate e e generico (nao revela a causa)", () => {
  const p = naoAutenticado();
  assert.equal(p.status, 401);
  assert.ok(p.headers["WWW-Authenticate"].startsWith("Bearer"));
  // Mensagem generica: a mesma para ausente/invalida/revogada/expirada.
  assert.ok(/ausente|invalida|revogada|expirada/i.test(p.detail ?? ""));
});

caso("429 carrega Retry-After em segundos", () => {
  const p = limiteExcedido(30);
  assert.equal(p.status, 429);
  assert.equal(p.headers["Retry-After"], "30");
});

caso("403 escopo insuficiente e 404 nao encontrado tem status certos", () => {
  assert.equal(proibido().status, 403);
  assert.equal(naoEncontrado("x").status, 404);
});

caso("paraJson produz envelope RFC 9457 com requestId e type absoluto", () => {
  const p = requisicaoInvalida("cursor corrompido", [{ campo: "cursor" }]);
  const j = p.paraJson("req-123", "/api/v1/leads");
  assert.equal(j.status, 400);
  assert.equal(j.title, "Requisicao invalida");
  assert.equal(j.detail, "cursor corrompido");
  assert.equal(j.requestId, "req-123");
  assert.equal(j.instance, "/api/v1/leads");
  assert.ok(j.type.startsWith("https://"), "type e URI absoluta");
  assert.deepEqual(j.errors, [{ campo: "cursor" }]);
});

caso("paraJson omite detail/instance quando ausentes", () => {
  const j = proibido().paraJson("req-9");
  assert.equal(j.requestId, "req-9");
  assert.equal("instance" in j, false);
  assert.ok(typeof j.title === "string" && j.title.length > 0);
});

caso("ProblemaApi e um Error (pode ser throw/catch no handler)", () => {
  const p = naoEncontrado("recurso x");
  assert.ok(p instanceof Error);
  assert.ok(p instanceof ProblemaApi);
  assert.equal(p.name, "ProblemaApi");
});

caso("type de cada erro e unico e sob o namespace de erros", () => {
  const tipos = [
    naoAutenticado().type,
    proibido().type,
    naoEncontrado().type,
    requisicaoInvalida().type,
    metodoNaoPermitido(LEITURA).type,
    limiteExcedido(1).type,
  ];
  for (const t of tipos) assert.ok(t.includes("/errors/"), `type '${t}' fora do namespace`);
  assert.equal(new Set(tipos).size, tipos.length, "types devem ser distintos");
});

console.log(`\nC22 API read-only 405 + erros RFC 9457: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

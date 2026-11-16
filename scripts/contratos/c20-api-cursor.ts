// Contrato dourado C20 — paginacao keyset (cursor) da API de Leitura v1.
//   npx tsx scripts/contratos/c20-api-cursor.ts
//
// Regra: o cursor codifica o par (valorOrdenacao, id) do ultimo item, e
// round-trip (codificar->decodificar) tem que preservar os dois campos.
// Cursor corrompido/invalido retorna null (handler responde 400, nunca crasha).
// Prova PURA (sem banco/rede).
import assert from "node:assert";
import { codificarCursor, decodificarCursor, type Cursor } from "../../src/lib/api-v1/cursor";

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

caso("round-trip preserva o par (o, i)", () => {
  const c: Cursor = { o: "2026-11-16T12:00:00.000Z", i: "ckxyz123" };
  const round = decodificarCursor(codificarCursor(c));
  assert.deepEqual(round, c);
});

caso("round-trip aguenta valores com caracteres especiais/unicode", () => {
  const c: Cursor = { o: "Açaí & Cia — \"linha 1\"\n", i: "id/+=?#" };
  const round = decodificarCursor(codificarCursor(c));
  assert.deepEqual(round, c);
});

caso("cursor e base64url (sem +, /, = que quebram em querystring)", () => {
  const enc = codificarCursor({ o: "x".repeat(40), i: "y".repeat(40) });
  assert.ok(!/[+/=]/.test(enc), "sem caracteres nao-url-safe");
});

caso("cursor corrompido (nao-base64) -> null", () => {
  assert.equal(decodificarCursor("@@@nao-e-base64@@@"), null);
});

caso("cursor base64 de JSON invalido -> null", () => {
  const lixo = Buffer.from("{nao json", "utf8").toString("base64url");
  assert.equal(decodificarCursor(lixo), null);
});

caso("cursor base64 de JSON sem os campos certos -> null", () => {
  const faltando = Buffer.from(JSON.stringify({ o: "so-o" }), "utf8").toString("base64url");
  assert.equal(decodificarCursor(faltando), null);
  const tipoErrado = Buffer.from(JSON.stringify({ o: 1, i: 2 }), "utf8").toString("base64url");
  assert.equal(decodificarCursor(tipoErrado), null);
});

caso("cursor de null/array -> null (nunca lanca)", () => {
  const nulo = Buffer.from("null", "utf8").toString("base64url");
  assert.equal(decodificarCursor(nulo), null);
  const arr = Buffer.from("[1,2]", "utf8").toString("base64url");
  assert.equal(decodificarCursor(arr), null);
});

caso("string vazia -> null", () => {
  assert.equal(decodificarCursor(""), null);
});

console.log(`\nC20 API cursor keyset (round-trip + 400 seguro): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

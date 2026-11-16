// Contrato dourado C19 — autorizacao por escopo da API de Leitura v1.
//   npx tsx scripts/contratos/c19-api-escopo.ts
//
// Regras (escopos.ts):
//  - read:all concede leitura de QUALQUER recurso de dominio.
//  - read:all NAO concede, por si so, read:pii nem read:mensagens (exposicao de
//    dados pessoais / conteudo de conversa e sempre deliberada).
//  - escopo granular read:<dominio> so libera o proprio dominio.
// Prova PURA (sem banco/rede).
import assert from "node:assert";
import {
  ESCOPO_TUDO,
  ESCOPO_PII,
  ESCOPO_MENSAGENS,
  podeLerRecurso,
  podeVerPii,
  podeVerMensagens,
  escoposDesconhecidos,
} from "../../src/lib/api-v1/escopos";

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

// --- read:all cobre leitura de dominio ---
caso("read:all le qualquer recurso de dominio", () => {
  assert.equal(podeLerRecurso([ESCOPO_TUDO], "read:pedidos"), true);
  assert.equal(podeLerRecurso([ESCOPO_TUDO], "read:clientes"), true);
  assert.equal(podeLerRecurso([ESCOPO_TUDO], "read:analytics"), true);
});

// --- granular so libera o proprio ---
caso("escopo granular so libera o dominio exato", () => {
  assert.equal(podeLerRecurso(["read:pedidos"], "read:pedidos"), true);
  assert.equal(podeLerRecurso(["read:pedidos"], "read:clientes"), false);
});

caso("sem escopo nenhum nao le nada", () => {
  assert.equal(podeLerRecurso([], "read:clientes"), false);
});

// --- read:all NAO implica PII ---
caso("read:all sozinho NAO ve PII em claro", () => {
  assert.equal(podeVerPii([ESCOPO_TUDO]), false);
});

caso("read:pii explicito ve PII", () => {
  assert.equal(podeVerPii([ESCOPO_PII]), true);
  assert.equal(podeVerPii([ESCOPO_TUDO, ESCOPO_PII]), true);
});

caso("sem read:pii nao ve PII", () => {
  assert.equal(podeVerPii([]), false);
  assert.equal(podeVerPii(["read:clientes"]), false);
});

// --- read:all NAO implica mensagens ---
caso("read:all sozinho NAO ve conteudo de mensagens", () => {
  assert.equal(podeVerMensagens([ESCOPO_TUDO]), false);
});

caso("read:mensagens explicito ve mensagens", () => {
  assert.equal(podeVerMensagens([ESCOPO_MENSAGENS]), true);
  assert.equal(podeVerMensagens([ESCOPO_TUDO, ESCOPO_MENSAGENS]), true);
});

// --- validacao de escopos desconhecidos (CLI) ---
caso("escoposDesconhecidos sinaliza so os fora do catalogo", () => {
  assert.deepEqual(escoposDesconhecidos([ESCOPO_TUDO, "read:clientes"]), []);
  assert.deepEqual(escoposDesconhecidos(["read:inventado"]), ["read:inventado"]);
  assert.deepEqual(
    escoposDesconhecidos([ESCOPO_PII, "write:tudo", "read:pedidos"]),
    ["write:tudo"],
  );
});

// --- defesa: um escopo de escrita nunca concede leitura por acidente ---
caso("escopo fora do padrao nao vira leitura magica", () => {
  assert.equal(podeLerRecurso(["write:all"], "read:clientes"), false);
  assert.equal(podeVerPii(["write:all"]), false);
});

console.log(`\nC19 API escopo (read:all != pii/mensagens): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

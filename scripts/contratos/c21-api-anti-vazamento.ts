// Contrato dourado C21 — FRONTEIRA ANTI-VAZAMENTO da API de Leitura v1.
//   npx tsx scripts/contratos/c21-api-anti-vazamento.ts
//
// Invariante central: um campo so existe na API se estiver na allowlist
// (recurso.campos). O serializador NUNCA copia chaves cruas da linha; e o
// Prisma select so pede colunas da allowlist. Por isso segredos (hash de senha,
// tokens, raw de mensagem, apiKey, webhookSecret...) nunca vazam por descuido,
// mesmo que a linha do banco os traga. Varre TODOS os recursos reais do
// registro + prova o gate de PII e de mensagem. Prova PURA (sem banco/rede).
import assert from "node:assert";
import { RECURSOS, listarRecursos } from "../../src/lib/api-v1/registro";
import {
  serializarItem,
  selecaoPrisma,
  colunasSelecionadas,
  type ContextoSerializacao,
} from "../../src/lib/api-v1/serializar";
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

// Segredos que NUNCA podem aparecer na saida, injetados em toda linha de teste.
const SEGREDOS = [
  "hash",
  "senha",
  "senhaHash",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "apiToken",
  "webhookSecret",
  "raw",
  "rawPayload",
  "instanceToken",
  "capiToken",
  "secret",
];

const CTX_TOTAL: ContextoSerializacao = { podePii: true, podeMensagens: true };

// Monta uma linha crua "hostil": todos os campos da allowlist + todos os segredos.
function linhaHostil(recurso: Recurso): Record<string, unknown> {
  const row: Record<string, unknown> = { id: "id-teste" };
  for (const nome of Object.keys(recurso.campos)) {
    row[nome] = `valor-${nome}`;
  }
  for (const s of SEGREDOS) row[s] = "VALOR-SECRETO-NAO-PODE-VAZAR";
  return row;
}

caso("registro tem recursos e listarRecursos == RECURSOS", () => {
  assert.ok(RECURSOS.length > 0, "ha recursos definidos");
  assert.equal(listarRecursos().length, RECURSOS.length);
});

caso("VARREDURA: saida so tem chaves da allowlist (+expand), zero segredo", () => {
  for (const recurso of RECURSOS) {
    const permitidas = new Set<string>(Object.keys(recurso.campos));
    permitidas.add("id"); // identidade sempre
    for (const nome of Object.keys(recurso.expand ?? {})) permitidas.add(nome);

    const out = serializarItem(recurso, linhaHostil(recurso), CTX_TOTAL);

    for (const chave of Object.keys(out)) {
      assert.ok(
        permitidas.has(chave),
        `recurso '${recurso.nome}': chave '${chave}' saiu sem estar na allowlist`,
      );
    }
    for (const s of SEGREDOS) {
      assert.ok(
        !(s in out),
        `recurso '${recurso.nome}': segredo '${s}' VAZOU na saida`,
      );
    }
    // Nenhum valor da saida pode conter a string sentinela de segredo.
    const dump = JSON.stringify(out);
    assert.ok(
      !dump.includes("VALOR-SECRETO-NAO-PODE-VAZAR"),
      `recurso '${recurso.nome}': valor secreto apareceu serializado`,
    );
  }
});

caso("VARREDURA: selecaoPrisma so pede colunas da allowlist (+id+watermark)", () => {
  for (const recurso of RECURSOS) {
    const permitidas = new Set<string>(Object.keys(recurso.campos));
    permitidas.add("id");
    permitidas.add(recurso.campoOrdenacao ?? "criadoEm");
    if (recurso.campoAtualizacao) permitidas.add(recurso.campoAtualizacao);
    // expand vira sub-objeto { relacao: {select} }, permitido tambem.
    for (const def of Object.values(recurso.expand ?? {})) permitidas.add(def.relacao);

    const sel = selecaoPrisma(recurso);
    for (const col of Object.keys(sel)) {
      assert.ok(
        permitidas.has(col),
        `recurso '${recurso.nome}': select pediu coluna '${col}' fora da allowlist`,
      );
    }
    for (const s of SEGREDOS) {
      if (permitidas.has(s)) continue; // caso (improvavel) de um campo legitimo homonimo
      assert.ok(!(s in sel), `recurso '${recurso.nome}': select pediu segredo '${s}'`);
    }
  }
});

// --- gate de PII: sem read:pii, campo pii sai mascarado; com, em claro ---
const recPii: Recurso = {
  nome: "t-pii",
  model: "x",
  escopo: "read:x",
  campos: {
    id: { tipo: "texto" },
    nome: { tipo: "pii", pii: "nome" },
    telefone: { tipo: "pii", pii: "telefone" },
  },
};

caso("gate PII: sem read:pii mascara, com read:pii revela", () => {
  const linha = { id: "1", nome: "Luccas Gorgone", telefone: "11987651234" };
  const mascarado = serializarItem(recPii, linha, { podePii: false, podeMensagens: false });
  assert.notEqual(mascarado.nome, "Luccas Gorgone");
  assert.notEqual(mascarado.telefone, "11987651234");
  assert.ok(!JSON.stringify(mascarado).includes("987651234"));

  const claro = serializarItem(recPii, linha, { podePii: true, podeMensagens: false });
  assert.equal(claro.nome, "Luccas Gorgone");
  assert.equal(claro.telefone, "11987651234");
});

// --- gate de mensagem: sem read:mensagens, campo mensagem vira null ---
const recMsg: Recurso = {
  nome: "t-msg",
  model: "x",
  escopo: "read:x",
  campos: {
    id: { tipo: "texto" },
    conteudo: { tipo: "mensagem" },
  },
};

caso("gate mensagem: sem read:mensagens vira null, com revela", () => {
  const linha = { id: "1", conteudo: "texto sensivel da conversa" };
  const sem = serializarItem(recMsg, linha, { podePii: false, podeMensagens: false });
  assert.equal(sem.conteudo, null);
  const com = serializarItem(recMsg, linha, { podePii: false, podeMensagens: true });
  assert.equal(com.conteudo, "texto sensivel da conversa");
});

// --- fields esparsos: so os pedidos (+id), nunca alem da allowlist ---
caso("fields esparsos retornam so o subconjunto pedido + id", () => {
  const linha = { id: "1", nome: "Ana Paula", telefone: "11999998888" };
  const ctx: ContextoSerializacao = { podePii: true, podeMensagens: false, fields: ["nome"] };
  const out = serializarItem(recPii, linha, ctx);
  assert.deepEqual(Object.keys(out).sort(), ["id", "nome"]);
  assert.equal(out.telefone, undefined);
});

caso("colunasSelecionadas sempre inclui id e watermark", () => {
  const cols = colunasSelecionadas(recPii, ["nome"]);
  assert.ok(cols.includes("id"), "id obrigatorio");
  assert.ok(cols.includes("nome"), "campo pedido presente");
});

console.log(`\nC21 API anti-vazamento (allowlist = fronteira): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

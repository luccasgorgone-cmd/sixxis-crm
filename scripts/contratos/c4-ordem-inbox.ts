// Contrato C4 — ordenacao da lista do Inbox, PURO (sem rede/banco).
//   npx tsx scripts/contratos/c4-ordem-inbox.ts
//
// Prova a regra de compararConversasInbox SEM UI:
//  - fixadas (pin) sempre primeiro, pin mais recente antes;
//  - "aguardando resposta nossa" (ultima msg IN) acima de "aguardando o cliente"
//    (ultima msg OUT) — responder (OUT) AFUNDA; cliente escrever (IN) SOBE;
//  - dentro de "aguardando nos": mais ANTIGO no topo (fila justa);
//  - dentro de "aguardando o cliente": mais RECENTE no topo;
//  - direcao ausente conta como "aguardando nos" (camada 0).
import assert from "node:assert";
import { compararConversasInbox, type OrdemInbox } from "../../src/lib/ordenacao";

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

// Ordena por uma chave estavel (id) aplicando o comparador, devolve os ids.
function ordenar(itens: (OrdemInbox & { id: string })[]): string[] {
  return [...itens].sort(compararConversasInbox).map((c) => c.id);
}

// Datas de referencia (mais antigo -> mais novo).
const T1 = "2026-10-01T08:00:00.000Z"; // mais antigo
const T2 = "2026-10-01T09:00:00.000Z";
const T3 = "2026-10-01T10:00:00.000Z";
const T4 = "2026-10-01T11:00:00.000Z"; // mais novo

caso("IN (aguardando nos) vem antes de OUT (aguardando cliente)", () => {
  const r = ordenar([
    { id: "out", ultimaDirecao: "OUT", ultimaMensagemEm: T4 },
    { id: "in", ultimaDirecao: "IN", ultimaMensagemEm: T1 },
  ]);
  assert.deepEqual(r, ["in", "out"]);
});

caso("responder (virar OUT) afunda para baixo de quem ainda espera resposta", () => {
  // 'alvo' era IN e passou a OUT; deve cair abaixo de todos os IN.
  const r = ordenar([
    { id: "cliente1", ultimaDirecao: "IN", ultimaMensagemEm: T2 },
    { id: "alvo", ultimaDirecao: "OUT", ultimaMensagemEm: T4 },
    { id: "cliente2", ultimaDirecao: "IN", ultimaMensagemEm: T3 },
  ]);
  assert.deepEqual(r, ["cliente1", "cliente2", "alvo"]);
});

caso("aguardando nos: mais ANTIGO no topo (fila justa)", () => {
  const r = ordenar([
    { id: "novo", ultimaDirecao: "IN", ultimaMensagemEm: T3 },
    { id: "antigo", ultimaDirecao: "IN", ultimaMensagemEm: T1 },
    { id: "medio", ultimaDirecao: "IN", ultimaMensagemEm: T2 },
  ]);
  assert.deepEqual(r, ["antigo", "medio", "novo"]);
});

caso("aguardando cliente: mais RECENTE no topo", () => {
  const r = ordenar([
    { id: "antigo", ultimaDirecao: "OUT", ultimaMensagemEm: T1 },
    { id: "novo", ultimaDirecao: "OUT", ultimaMensagemEm: T3 },
    { id: "medio", ultimaDirecao: "OUT", ultimaMensagemEm: T2 },
  ]);
  assert.deepEqual(r, ["novo", "medio", "antigo"]);
});

caso("fixadas (pin) sempre primeiro, independente da camada", () => {
  const r = ordenar([
    { id: "inSemPin", ultimaDirecao: "IN", ultimaMensagemEm: T4 },
    { id: "outFixada", ultimaDirecao: "OUT", ultimaMensagemEm: T1, fixadaEm: T2 },
  ]);
  assert.deepEqual(r, ["outFixada", "inSemPin"]);
});

caso("pin mais recente antes do pin mais antigo", () => {
  const r = ordenar([
    { id: "pinAntigo", ultimaDirecao: "IN", ultimaMensagemEm: T1, fixadaEm: T1 },
    { id: "pinNovo", ultimaDirecao: "OUT", ultimaMensagemEm: T4, fixadaEm: T3 },
  ]);
  assert.deepEqual(r, ["pinNovo", "pinAntigo"]);
});

caso("direcao ausente conta como aguardando nos (camada 0)", () => {
  const r = ordenar([
    { id: "out", ultimaDirecao: "OUT", ultimaMensagemEm: T4 },
    { id: "semDir", ultimaMensagemEm: T1 },
  ]);
  assert.deepEqual(r, ["semDir", "out"]);
});

caso("cenario combinado: pin > aguardando nos (antigo->novo) > aguardando cliente", () => {
  const r = ordenar([
    { id: "respRecente", ultimaDirecao: "OUT", ultimaMensagemEm: T4 },
    { id: "clienteNovo", ultimaDirecao: "IN", ultimaMensagemEm: T3 },
    { id: "pin", ultimaDirecao: "OUT", ultimaMensagemEm: T1, fixadaEm: T4 },
    { id: "clienteAntigo", ultimaDirecao: "IN", ultimaMensagemEm: T1 },
    { id: "respAntiga", ultimaDirecao: "OUT", ultimaMensagemEm: T2 },
  ]);
  assert.deepEqual(r, [
    "pin",
    "clienteAntigo",
    "clienteNovo",
    "respRecente",
    "respAntiga",
  ]);
});

console.log(`\nC4 ordem do Inbox: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

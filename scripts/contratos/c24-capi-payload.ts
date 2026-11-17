// Contrato dourado C24 — payload do Meta CAPI (Purchase) + parsing da resposta.
//   npx tsx scripts/contratos/c24-capi-payload.ts
//
// Prova, sem banco/rede, que:
//  - montarUserData hasheia so o que existe (ph/em/fn), inclui ctwa_clid e
//    external_id (SHA-256 do id do Lead) quando presentes, e SEMPRE page_id;
//  - montarEventoPurchase usa o event_time informado (hora do GANHO,
//    deterministico p/ retry) e nao "agora"; carimba action_source
//    business_messaging + messaging_channel whatsapp;
//  - extrairRespostaGraph tira events_received, fbtrace_id e messages[] do raw
//    da Graph, tolerando raw nulo/sem campos.
import assert from "node:assert";
import crypto from "node:crypto";
import {
  montarUserData,
  montarEventoPurchase,
  extrairRespostaGraph,
} from "../../src/lib/metaCapi";

const PAGE_ID = process.env.META_PAGE_ID || "113494068344928";
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

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

// ---- montarUserData ----

caso("telefone+nome+ctwa+lead, sem email -> ph/fn/ctwa_clid/external_id/page_id", () => {
  const ud = montarUserData({
    telefone: "(11) 99999-0000",
    email: null,
    nome: "Joao Silva",
    ctwaClid: "ABC123",
    leadId: "lead_cuid_1",
  });
  assert.ok(Array.isArray(ud.ph), "ph presente");
  assert.ok(Array.isArray(ud.fn), "fn presente");
  assert.equal(ud.em, undefined, "em ausente (sem email)");
  assert.equal(ud.ctwa_clid, "ABC123");
  assert.deepEqual(ud.external_id, [sha("lead_cuid_1")]);
  assert.equal(ud.page_id, PAGE_ID);
});

caso("telefone hasheado = sha256 so dos digitos", () => {
  const ud = montarUserData({ telefone: "(11) 98888-7777" });
  assert.deepEqual(ud.ph, [sha("11988887777")]);
});

caso("so leadId -> external_id + page_id, sem ph/em/fn/ctwa_clid", () => {
  const ud = montarUserData({ leadId: "abc" });
  assert.equal(ud.ph, undefined);
  assert.equal(ud.em, undefined);
  assert.equal(ud.fn, undefined);
  assert.equal(ud.ctwa_clid, undefined);
  assert.deepEqual(ud.external_id, [sha("abc")]);
  assert.equal(ud.page_id, PAGE_ID);
});

caso("sem leadId -> sem external_id, mas page_id sempre", () => {
  const ud = montarUserData({ telefone: "11999990000" });
  assert.equal(ud.external_id, undefined);
  assert.equal(ud.page_id, PAGE_ID);
});

// ---- montarEventoPurchase ----

caso("usa event_time informado (hora do GANHO), nao agora", () => {
  const ev = montarEventoPurchase({
    valor: 2750,
    eventId: "purchase-neg1",
    eventTime: 1700000000,
    telefone: "11999990000",
    leadId: "lead1",
  });
  assert.equal(ev.event_time, 1700000000);
  assert.equal(ev.event_name, "Purchase");
  assert.equal(ev.event_id, "purchase-neg1");
  assert.equal(ev.action_source, "business_messaging");
  assert.equal(ev.messaging_channel, "whatsapp");
  assert.deepEqual(ev.custom_data, { value: 2750, currency: "BRL" });
});

caso("moeda custom respeitada", () => {
  const ev = montarEventoPurchase({ valor: 10, eventId: "x", moeda: "USD", eventTime: 1 });
  assert.deepEqual(ev.custom_data, { value: 10, currency: "USD" });
});

caso("sem eventTime -> cai pra epoch atual (number), nao quebra", () => {
  const antes = Math.floor(Date.now() / 1000);
  const ev = montarEventoPurchase({ valor: 1, eventId: "x" });
  assert.equal(typeof ev.event_time, "number");
  assert.ok((ev.event_time as number) >= antes);
});

// ---- extrairRespostaGraph ----

caso("raw completo -> events_received, fbtrace_id, messages[]", () => {
  const r = extrairRespostaGraph({
    events_received: 1,
    messages: [],
    fbtrace_id: "Abc-trace-123",
  });
  assert.equal(r.eventsReceived, 1);
  assert.equal(r.fbtraceId, "Abc-trace-123");
  assert.deepEqual(r.messages, []);
});

caso("raw nulo -> tudo null (nao quebra)", () => {
  const r = extrairRespostaGraph(null);
  assert.equal(r.eventsReceived, null);
  assert.equal(r.fbtraceId, null);
  assert.equal(r.messages, null);
});

caso("raw sem campos -> nulls, messages so se array", () => {
  const r = extrairRespostaGraph({ foo: "bar" });
  assert.equal(r.eventsReceived, null);
  assert.equal(r.fbtraceId, null);
  assert.equal(r.messages, null);
});

caso("messages com avisos preservado", () => {
  const r = extrairRespostaGraph({
    events_received: 1,
    messages: ["warn: ..."],
    fbtrace_id: "t",
  });
  assert.deepEqual(r.messages, ["warn: ..."]);
});

console.log(`\nC24 CAPI payload + parsing: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

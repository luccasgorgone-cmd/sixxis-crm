// Contrato dourado C8 — captura do gclid do Google Ads na 1a mensagem + gerador
// do CSV de conversoes offline.
//   npx tsx scripts/contratos/c8-gclid.ts
//
// Prova, sem banco/rede, que:
//  - extrairGclid pega o gclid do marcador [#g:...], valida charset, remove o
//    marcador do texto (fim/meio/inicio/multiplo) e nunca grava lixo;
//  - montarCsvGoogleOffline emite o dialeto exato do Site (header, LF, SEM BOM);
//  - formatarDataGoogleAds produz o ISO -03:00 de Sao Paulo.
import assert from "node:assert";
import { extrairGclid } from "../../src/lib/canal/gclid";
import {
  CABECALHO_GOOGLE_OFFLINE,
  montarCsvGoogleOffline,
  formatarDataGoogleAds,
} from "../../src/lib/relatorios/googleOffline";

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

// ---- extrairGclid ----

caso("marcador no fim -> captura + remove", () => {
  const r = extrairGclid("Ola, tenho interesse [#g:abc123]");
  assert.equal(r.gclid, "abc123");
  assert.equal(r.textoLimpo, "Ola, tenho interesse");
});

caso("marcador no meio -> nao junta palavras", () => {
  const r = extrairGclid("oi [#g:xYz_9] mundo");
  assert.equal(r.gclid, "xYz_9");
  assert.equal(r.textoLimpo, "oi mundo");
});

caso("marcador no inicio", () => {
  const r = extrairGclid("[#g:CjwK-123.ab] bom dia");
  assert.equal(r.gclid, "CjwK-123.ab");
  assert.equal(r.textoLimpo, "bom dia");
});

caso("gclid realista (base64url-ish)", () => {
  const g = "CjwKCAjw_eLVBhBEEiwAeaYZfPn2pQ49T6n9HL2PTo0Y7J9gSSyWW8sr1cYQO1HhFsdeR5YDYxGLpBoC7MoQAvD_BwE";
  const r = extrairGclid(`Vim do anuncio [#g:${g}]`);
  assert.equal(r.gclid, g);
  assert.equal(r.textoLimpo, "Vim do anuncio");
});

caso("ausente -> gclid null, texto intacto", () => {
  const r = extrairGclid("oi tudo bem");
  assert.equal(r.gclid, null);
  assert.equal(r.textoLimpo, "oi tudo bem");
});

caso("charset invalido (espaco) -> gclid null, marcador removido", () => {
  const r = extrairGclid("oi [#g:ab cd]");
  assert.equal(r.gclid, null);
  assert.equal(r.textoLimpo, "oi");
});

caso("charset invalido (@) -> gclid null, marcador removido", () => {
  const r = extrairGclid("[#g:a@b] teste");
  assert.equal(r.gclid, null);
  assert.equal(r.textoLimpo, "teste");
});

caso("multiplo -> pega o 1o, remove todos", () => {
  const r = extrairGclid("[#g:aaa] meio [#g:bbb]");
  assert.equal(r.gclid, "aaa");
  assert.equal(r.textoLimpo, "meio");
});

caso("marcador vazio -> gclid null, removido", () => {
  const r = extrairGclid("[#g:] oi");
  assert.equal(r.gclid, null);
  assert.equal(r.textoLimpo, "oi");
});

caso("null/undefined -> gclid null, texto vazio", () => {
  assert.deepEqual(extrairGclid(null), { gclid: null, textoLimpo: "" });
  assert.deepEqual(extrairGclid(undefined), { gclid: null, textoLimpo: "" });
});

caso("texto que e so o marcador -> texto vazio", () => {
  const r = extrairGclid("[#g:soEle]");
  assert.equal(r.gclid, "soEle");
  assert.equal(r.textoLimpo, "");
});

// ---- montarCsvGoogleOffline ----

caso("CSV vazio = so header + \\n, sem BOM", () => {
  const csv = montarCsvGoogleOffline([]);
  assert.equal(csv, CABECALHO_GOOGLE_OFFLINE + "\n");
  assert.equal(csv.charCodeAt(0), "g".charCodeAt(0)); // nao e
  assert.ok(!csv.includes("\r")); // LF puro
});

caso("CSV com linhas = formato exato do Site", () => {
  const csv = montarCsvGoogleOffline([
    {
      gclid: "CjwK123",
      data: "2026-10-11T15:19:08-03:00",
      valor: "990.00",
      moeda: "BRL",
      transactionId: "cmuk728ce0ehh0xqr86srq1c6",
    },
  ]);
  assert.equal(
    csv,
    "gclid,data,valor,moeda,transaction_id\n" +
      "CjwK123,2026-10-11T15:19:08-03:00,990.00,BRL,cmuk728ce0ehh0xqr86srq1c6\n",
  );
});

// ---- formatarDataGoogleAds ----

caso("formata UTC -> Sao Paulo -03:00", () => {
  // 18:19:08Z == 15:19:08 em Sao Paulo (-03:00)
  const d = new Date("2026-10-11T18:19:08.000Z");
  assert.equal(formatarDataGoogleAds(d), "2026-10-11T15:19:08-03:00");
});

caso("meia-noite SP usa 00, nao 24", () => {
  // 03:00:00Z == 00:00:00 em Sao Paulo
  const d = new Date("2026-10-12T03:00:00.000Z");
  assert.equal(formatarDataGoogleAds(d), "2026-10-12T00:00:00-03:00");
});

console.log(`\nC8 gclid + CSV google offline: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

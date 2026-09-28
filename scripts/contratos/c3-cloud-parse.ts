// Contrato C3 — parse do webhook do WhatsApp Cloud API (F4), PURO (sem rede/banco).
//   npx tsx scripts/contratos/c3-cloud-parse.ts
//
// Prova que parseWebhookCloud traduz o payload OFICIAL da Meta para as MESMAS
// AcaoIngest que o nucleo ja consome (texto/midia/reply/anuncio/reacao/status),
// e que a validacao de assinatura (HMAC-SHA256 do corpo cru) aceita so o correto.
// Os fixtures usam os nomes de campo reais do webhook (entry/changes/value/...).
import assert from "node:assert";
import crypto from "node:crypto";
import {
  parseWebhookCloud,
  verificarAssinaturaCloud,
} from "../../src/lib/canal/cloudApiAdapter";
import type { AcaoIngest, EventoMensagem } from "../../src/lib/canal/tipos";

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

// Monta um webhook com um unico change 'messages' e o value dado.
function wh(value: unknown): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA_ID", changes: [{ field: "messages", value }] }],
  };
}
const META = { display_phone_number: "551833041233", phone_number_id: "PNID_123" };
const CONTATO = { profile: { name: "Cliente Teste" }, wa_id: "5518999990001" };

function soMensagem(acoes: AcaoIngest[]): EventoMensagem {
  assert.equal(acoes.length, 1, `esperava 1 acao, veio ${acoes.length}`);
  assert.equal(acoes[0].acao, "MENSAGEM");
  return (acoes[0] as { acao: "MENSAGEM"; evento: EventoMensagem }).evento;
}

// 1. Texto simples.
caso("texto -> MENSAGEM TEXTO IN, identidade e conta corretas", () => {
  const ev = soMensagem(
    parseWebhookCloud(
      wh({
        messaging_product: "whatsapp",
        metadata: META,
        contacts: [CONTATO],
        messages: [
          { from: "5518999990001", id: "wamid.AAA", timestamp: "1730000000", type: "text", text: { body: "ola" } },
        ],
      }),
    ),
  );
  assert.equal(ev.provider, "CLOUD_API");
  assert.equal(ev.direcao, "IN");
  assert.equal(ev.externalId, "wamid.AAA");
  assert.equal(ev.contaRef, "PNID_123");
  assert.equal(ev.cliente.tipo, "TELEFONE");
  assert.equal(ev.cliente.valor, "5518999990001");
  assert.equal(ev.cliente.telefone, "5518999990001");
  assert.equal(ev.cliente.nomePerfil, "Cliente Teste");
  assert.equal(ev.conteudo.tipoDominio, "TEXTO");
  assert.equal(ev.conteudo.texto, "ola");
  assert.ok(ev.ocorridoEm instanceof Date);
});

// 2. Imagem com legenda.
caso("imagem com caption -> IMAGEM, midiaRef=id, texto=caption", () => {
  const ev = soMensagem(
    parseWebhookCloud(
      wh({
        metadata: META,
        messages: [
          {
            from: "5518999990001",
            id: "wamid.IMG",
            timestamp: "1730000001",
            type: "image",
            image: { id: "MEDIA_ID_1", mime_type: "image/jpeg", caption: "olha isso" },
          },
        ],
      }),
    ),
  );
  assert.equal(ev.conteudo.tipoDominio, "IMAGEM");
  assert.equal(ev.conteudo.midiaRef, "MEDIA_ID_1");
  assert.equal(ev.conteudo.texto, "olha isso");
  assert.equal(ev.conteudo.ehSticker, false);
});

// 3. Reply (context.id) -> respondeA.
caso("reply -> respondeA = context.id", () => {
  const ev = soMensagem(
    parseWebhookCloud(
      wh({
        metadata: META,
        messages: [
          {
            from: "5518999990001",
            id: "wamid.REP",
            timestamp: "1730000002",
            type: "text",
            context: { id: "wamid.CITADA" },
            text: { body: "respondendo" },
          },
        ],
      }),
    ),
  );
  assert.equal(ev.respondeA, "wamid.CITADA");
});

// 4. Click-to-WhatsApp ad (referral) -> origemAnuncio.
caso("referral de anuncio -> origemAnuncio preenchido", () => {
  const ev = soMensagem(
    parseWebhookCloud(
      wh({
        metadata: META,
        messages: [
          {
            from: "5518999990001",
            id: "wamid.AD",
            timestamp: "1730000003",
            type: "text",
            text: { body: "vim do anuncio" },
            referral: {
              source_url: "https://fb.com/ad",
              source_id: "AD_123",
              source_type: "ad",
              headline: "Promo Piso",
              ctwa_clid: "CTWA_XYZ",
            },
          },
        ],
      }),
    ),
  );
  assert.ok(ev.origemAnuncio);
  assert.equal(ev.origemAnuncio?.ctwaClid, "CTWA_XYZ");
  assert.equal(ev.origemAnuncio?.anuncioId, "AD_123");
  assert.equal(ev.origemAnuncio?.anuncioTitulo, "Promo Piso");
  assert.equal(ev.origemAnuncio?.anuncioUrl, "https://fb.com/ad");
  assert.equal(ev.origemAnuncio?.origemDetalhe, "ad");
});

// 5. Reacao -> acao REACAO (nao MENSAGEM).
caso("reaction -> REACAO com alvo e emoji", () => {
  const acoes = parseWebhookCloud(
    wh({
      metadata: META,
      messages: [
        {
          from: "5518999990001",
          id: "wamid.RCT",
          timestamp: "1730000004",
          type: "reaction",
          reaction: { message_id: "wamid.ALVO", emoji: "❤️" },
        },
      ],
    }),
  );
  assert.equal(acoes.length, 1);
  assert.equal(acoes[0].acao, "REACAO");
  const r = acoes[0] as { acao: "REACAO"; alvoExternalId: string; emoji: string };
  assert.equal(r.alvoExternalId, "wamid.ALVO");
  assert.equal(r.emoji, "❤️");
});

// 6. Status de entrega -> acao STATUS.
caso("status -> acao STATUS", () => {
  const acoes = parseWebhookCloud(
    wh({
      metadata: META,
      statuses: [{ id: "wamid.AAA", status: "delivered" }],
    }),
  );
  assert.equal(acoes.length, 1);
  assert.equal(acoes[0].acao, "STATUS");
});

// 7. Sticker -> OUTRO, ehSticker true, SEM midiaRef (nao baixa .webp).
caso("sticker -> OUTRO ehSticker sem midiaRef", () => {
  const ev = soMensagem(
    parseWebhookCloud(
      wh({
        metadata: META,
        messages: [
          {
            from: "5518999990001",
            id: "wamid.STK",
            timestamp: "1730000005",
            type: "sticker",
            sticker: { id: "MEDIA_STK", mime_type: "image/webp" },
          },
        ],
      }),
    ),
  );
  assert.equal(ev.conteudo.tipoDominio, "OUTRO");
  assert.equal(ev.conteudo.ehSticker, true);
  assert.equal(ev.conteudo.midiaRef, null);
});

// 8. Audio (voice note) -> AUDIO, midiaRef=id.
caso("audio voice -> AUDIO midiaRef=id", () => {
  const ev = soMensagem(
    parseWebhookCloud(
      wh({
        metadata: META,
        messages: [
          {
            from: "5518999990001",
            id: "wamid.AUD",
            timestamp: "1730000006",
            type: "audio",
            audio: { id: "MEDIA_AUD", mime_type: "audio/ogg", voice: true },
          },
        ],
      }),
    ),
  );
  assert.equal(ev.conteudo.tipoDominio, "AUDIO");
  assert.equal(ev.conteudo.midiaRef, "MEDIA_AUD");
});

// 9. Contato compartilhado -> OUTRO + contato {nome, telefone}.
caso("contacts -> OUTRO com contato nome/telefone", () => {
  const ev = soMensagem(
    parseWebhookCloud(
      wh({
        metadata: META,
        messages: [
          {
            from: "5518999990001",
            id: "wamid.CTT",
            timestamp: "1730000007",
            type: "contacts",
            contacts: [
              { name: { formatted_name: "Joao Silva" }, phones: [{ phone: "+55 18 99999-0002" }] },
            ],
          },
        ],
      }),
    ),
  );
  assert.equal(ev.conteudo.tipoDominio, "OUTRO");
  assert.equal(ev.conteudo.contato?.nome, "Joao Silva");
  assert.equal(ev.conteudo.contato?.telefone, "+55 18 99999-0002");
});

// 10. Varias mensagens no MESMO webhook -> N acoes, na ordem.
caso("duas mensagens num webhook -> 2 acoes na ordem", () => {
  const acoes = parseWebhookCloud(
    wh({
      metadata: META,
      contacts: [CONTATO],
      messages: [
        { from: "5518999990001", id: "wamid.M1", timestamp: "1730000010", type: "text", text: { body: "um" } },
        { from: "5518999990001", id: "wamid.M2", timestamp: "1730000011", type: "text", text: { body: "dois" } },
      ],
    }),
  );
  assert.equal(acoes.length, 2);
  assert.equal((acoes[0] as { evento: EventoMensagem }).evento.externalId, "wamid.M1");
  assert.equal((acoes[1] as { evento: EventoMensagem }).evento.externalId, "wamid.M2");
});

// 11. Sem entry -> IGNORAR.
caso("payload sem entry -> IGNORAR", () => {
  const acoes = parseWebhookCloud({ object: "whatsapp_business_account" });
  assert.equal(acoes.length, 1);
  assert.equal(acoes[0].acao, "IGNORAR");
});

// 12. field != messages -> IGNORAR (nao explode).
caso("field diferente de messages -> IGNORAR", () => {
  const acoes = parseWebhookCloud({
    object: "whatsapp_business_account",
    entry: [{ id: "W", changes: [{ field: "account_update", value: {} }] }],
  });
  assert.equal(acoes.length, 1);
  assert.equal(acoes[0].acao, "IGNORAR");
});

// 13. Assinatura X-Hub-Signature-256: aceita o correto, recusa o resto.
caso("assinatura: HMAC correto passa, errado/ausente falha", () => {
  const segredo = "app_secret_de_teste";
  const corpo = JSON.stringify({ hello: "world" });
  const hex = crypto.createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");
  assert.equal(verificarAssinaturaCloud(corpo, `sha256=${hex}`, segredo), true);
  assert.equal(verificarAssinaturaCloud(corpo, `sha256=${"0".repeat(64)}`, segredo), false);
  assert.equal(verificarAssinaturaCloud(corpo, `sha256=${hex}`, undefined), false);
  assert.equal(verificarAssinaturaCloud(corpo, null, segredo), false);
  // corpo adulterado com a mesma assinatura -> falha.
  assert.equal(verificarAssinaturaCloud(corpo + " ", `sha256=${hex}`, segredo), false);
});

console.log(`\nC3 cloud parse: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

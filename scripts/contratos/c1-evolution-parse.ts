// Contrato dourado C1/C3 — parser PURO do canal Evolution (F1).
//   npx tsx scripts/contratos/c1-evolution-parse.ts
//
// Prova, sem banco/rede/credencial, que parseEventoEvolution reproduz a arvore
// de decisao que antes vivia inline em processarEvento: cada tipo de evento cai
// na acao canonica certa, e uma mensagem normal e parseada nos campos exatos que
// o fluxo antigo computava (telefone, tipo, conteudo, direcao, midia, anuncio,
// reply, resolucao de @lid). Fixtures sao SINTETICAS (numeros de exemplo).
//
// C3 (OUT nunca roteia) e verificado indiretamente: o parser marca direcao=OUT
// e o nucleo ja condiciona negocio/roteamento a direcao===IN — coberto pelos
// casos de eco fromMe abaixo (o parser nunca transforma OUT em acao de negocio).
import assert from "node:assert";
import { parseEventoEvolution } from "../../src/lib/queue";
import { TipoMsg } from "../../src/generated/prisma/client";

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

const JID = "5511999990001@s.whatsapp.net";

// ---- Eventos de controle (nao-MENSAGEM) ----

caso("CALL -> IGNORAR/call", () => {
  const r = parseEventoEvolution({ event: "CALL" });
  assert.equal(r.acao, "IGNORAR");
  if (r.acao === "IGNORAR") assert.equal(r.motivo, "call");
});

caso("MESSAGES_DELETE com key.id -> REVOGACAO", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_DELETE",
    data: { key: { id: "DEL1" } },
  });
  assert.equal(r.acao, "REVOGACAO");
  if (r.acao === "REVOGACAO") assert.equal(r.externalId, "DEL1");
});

caso("messages.delete (ponto) sem id -> IGNORAR/delete-sem-id", () => {
  const r = parseEventoEvolution({ event: "messages.delete", data: {} });
  assert.equal(r.acao, "IGNORAR");
  if (r.acao === "IGNORAR") assert.equal(r.motivo, "delete-sem-id");
});

caso("MESSAGES_UPDATE stub REVOKE -> REVOGACAO", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPDATE",
    data: { key: { id: "M1" }, update: { messageStubType: 1 } } as never,
  });
  assert.equal(r.acao, "REVOGACAO");
  if (r.acao === "REVOGACAO") assert.equal(r.externalId, "M1");
});

caso("MESSAGES_UPDATE protocolMessage EDIT -> EDICAO", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPDATE",
    data: {
      key: { id: "ignorado" },
      message: {
        protocolMessage: {
          type: 14,
          key: { id: "E1" },
          editedMessage: { conversation: "texto editado" },
        },
      },
    },
  });
  assert.equal(r.acao, "EDICAO");
  if (r.acao === "EDICAO") {
    assert.equal(r.externalId, "E1");
    assert.equal(r.texto, "texto editado");
  }
});

caso("MESSAGES_UPDATE status -> STATUS", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPDATE",
    data: { key: { id: "S1" }, update: { status: "DELIVERY_ACK" } } as never,
  });
  assert.equal(r.acao, "STATUS");
});

caso("evento desconhecido -> IGNORAR/evento-nao-tratado", () => {
  const r = parseEventoEvolution({ event: "PRESENCE_UPDATE" });
  assert.equal(r.acao, "IGNORAR");
  if (r.acao === "IGNORAR") assert.equal(r.motivo, "evento-nao-tratado");
});

// ---- Upsert: ramos de descarte/roteamento ----

caso("reacao IN -> REACAO", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "R1", remoteJid: JID, fromMe: false },
      message: { reactionMessage: { key: { id: "ALVO1" }, text: "👍" } },
    },
  });
  assert.equal(r.acao, "REACAO");
  if (r.acao === "REACAO") {
    assert.equal(r.alvoExternalId, "ALVO1");
    assert.equal(r.emoji, "👍");
  }
});

caso("reacao fromMe -> cai como MENSAGEM OUTRO/OUT (fluxo antigo)", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "R2", remoteJid: JID, fromMe: true },
      message: { reactionMessage: { key: { id: "ALVO2" }, text: "❤️" } },
    },
  });
  assert.equal(r.acao, "MENSAGEM");
  if (r.acao === "MENSAGEM") {
    assert.equal(r.evento.direcao, "OUT");
    assert.equal(r.evento.conteudo.tipoDominio, TipoMsg.OUTRO);
    assert.equal(r.evento.conteudo.texto, null);
  }
});

caso("grupo @g.us -> GRUPO", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "G1", remoteJid: "120363000000000000@g.us", fromMe: false },
      message: { conversation: "oi grupo" },
    },
  });
  assert.equal(r.acao, "GRUPO");
});

caso("status@broadcast -> IGNORAR/broadcast-newsletter", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "B1", remoteJid: "status@broadcast", fromMe: false },
      message: { conversation: "x" },
    },
  });
  assert.equal(r.acao, "IGNORAR");
  if (r.acao === "IGNORAR") assert.equal(r.motivo, "broadcast-newsletter");
});

caso("@lid + fromMe -> IGNORAR/lid-fromme", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "L0", remoteJid: "111111111111111@lid", fromMe: true },
      message: { conversation: "eco" },
    },
  });
  assert.equal(r.acao, "IGNORAR");
  if (r.acao === "IGNORAR") assert.equal(r.motivo, "lid-fromme");
});

caso("sem jid -> IGNORAR/sem-jid-ou-externalid", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: { key: { id: "SEMJID" }, message: { conversation: "x" } },
  });
  assert.equal(r.acao, "IGNORAR");
  if (r.acao === "IGNORAR") assert.equal(r.motivo, "sem-jid-ou-externalid");
});

// ---- Upsert: MENSAGEM (parsing dos campos) ----

caso("texto IN -> MENSAGEM com telefone/conteudo/tipo/direcao/conta", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    instance: "sixxis-wa1",
    data: {
      key: { id: "T1", remoteJid: JID, fromMe: false },
      pushName: "Cliente Teste",
      message: { conversation: "Ola, quero orcamento" },
      messageTimestamp: 1690000000,
    },
  });
  assert.equal(r.acao, "MENSAGEM");
  if (r.acao === "MENSAGEM") {
    const e = r.evento;
    assert.equal(e.externalId, "T1");
    assert.equal(e.direcao, "IN");
    assert.equal(e.provider, "EVOLUTION");
    assert.equal(e.contaRef, "sixxis-wa1");
    assert.equal(e.cliente.telefone, "5511999990001");
    assert.equal(e.cliente.tipo, "TELEFONE");
    assert.equal(e.cliente.nomePerfil, "Cliente Teste");
    assert.equal(e.conteudo.tipoDominio, TipoMsg.TEXTO);
    assert.equal(e.conteudo.texto, "Ola, quero orcamento");
    assert.ok(e.ocorridoEm instanceof Date);
  }
});

caso("saida fromMe -> nomePerfil ausente e direcao OUT", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "T2", remoteJid: JID, fromMe: true },
      pushName: "Voce",
      message: { conversation: "resposta do atendente" },
    },
  });
  assert.equal(r.acao, "MENSAGEM");
  if (r.acao === "MENSAGEM") {
    assert.equal(r.evento.direcao, "OUT");
    assert.equal(r.evento.cliente.nomePerfil, undefined);
  }
});

caso("imagem com legenda -> IMAGEM + midiaRef", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "IMG1", remoteJid: JID, fromMe: false },
      message: {
        imageMessage: { caption: "minha foto", url: "https://enc.exemplo/a.enc" },
      },
    },
  });
  assert.equal(r.acao, "MENSAGEM");
  if (r.acao === "MENSAGEM") {
    assert.equal(r.evento.conteudo.tipoDominio, TipoMsg.IMAGEM);
    assert.equal(r.evento.conteudo.texto, "minha foto");
    assert.equal(r.evento.conteudo.midiaRef, "https://enc.exemplo/a.enc");
    assert.equal(r.evento.conteudo.ehSticker, false);
  }
});

caso("figurinha -> OUTRO, ehSticker=true, midiaRef=null", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "STK1", remoteJid: JID, fromMe: false },
      message: { stickerMessage: { url: "https://enc.exemplo/s.enc" } },
    },
  });
  assert.equal(r.acao, "MENSAGEM");
  if (r.acao === "MENSAGEM") {
    assert.equal(r.evento.conteudo.tipoDominio, TipoMsg.OUTRO);
    assert.equal(r.evento.conteudo.ehSticker, true);
    assert.equal(r.evento.conteudo.midiaRef, null);
    assert.equal(r.evento.conteudo.texto, "[figurinha]");
  }
});

caso("anuncio CTWA -> origemAnuncio preenchido", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "AD1", remoteJid: JID, fromMe: false },
      message: {
        extendedTextMessage: {
          text: "vim do anuncio",
          contextInfo: {
            externalAdReply: {
              title: "Promo",
              sourceId: "AD123",
              sourceUrl: "https://x.exemplo",
              ctwaClid: "CLID1",
            },
          },
        },
      },
    },
  });
  assert.equal(r.acao, "MENSAGEM");
  if (r.acao === "MENSAGEM") {
    const a = r.evento.origemAnuncio;
    assert.ok(a);
    assert.equal(a?.ctwaClid, "CLID1");
    assert.equal(a?.anuncioId, "AD123");
    assert.equal(a?.anuncioTitulo, "Promo");
  }
});

caso("reply (stanzaId) -> respondeA", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "RP1", remoteJid: JID, fromMe: false },
      message: {
        extendedTextMessage: {
          text: "respondendo",
          contextInfo: { stanzaId: "ORIG99" },
        },
      },
    },
  });
  assert.equal(r.acao, "MENSAGEM");
  if (r.acao === "MENSAGEM") assert.equal(r.evento.respondeA, "ORIG99");
});

caso("@lid IN com senderPn -> telefone resolvido, resolvidoDe=senderPn", () => {
  const r = parseEventoEvolution({
    event: "MESSAGES_UPSERT",
    data: {
      key: {
        id: "L1",
        remoteJid: "888888888888888@lid",
        fromMe: false,
        senderPn: "5511999990002@s.whatsapp.net",
      } as never,
      message: { conversation: "oi" },
    },
  });
  assert.equal(r.acao, "MENSAGEM");
  if (r.acao === "MENSAGEM") {
    assert.equal(r.evento.cliente.telefone, "5511999990002");
    assert.equal(r.evento.cliente.resolvidoDe, "senderPn");
    assert.equal(r.evento.cliente.tipo, "TELEFONE");
  }
});

console.log(`\nC1/C3 parser Evolution: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

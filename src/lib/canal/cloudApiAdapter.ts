// F4 — adaptador do canal WhatsApp Cloud API (oficial, Meta).
//
// Duas metades, ambas no MESMO contrato canonico do F1/F2 (canal/tipos.ts):
//  1. parseWebhookCloud(payload): AcaoIngest[] — PURO. Traduz o webhook cru da
//     Meta para as mesmas AcaoIngest que o nucleo (ingerir) ja consome da
//     Evolution. Difere da Evolution em UMA coisa: a Meta pode empacotar VARIAS
//     mensagens/status num unico webhook (entry[].changes[].value.messages[]),
//     entao aqui o retorno e uma LISTA (a Evolution entrega 1 evento por vez).
//  2. adapterEnvioCloud — envio via Graph API (graph.facebook.com/<pnid>/messages).
//
// F4 e SO codigo, DESLIGADO: nenhuma conta CLOUD_API existe ainda (todos os
// numeros seguem na Evolution), o webhook so processa com a flag CLOUD_API_ATIVO
// ligada, e o envio exige um token que ainda nao esta no ambiente (retorna
// CONFIG_AUSENTE sem tocar a rede). Zero trafego real ate o piloto (F5).
//
// Nomes de campo conferidos contra o schema oficial do webhook (nao chutados):
//   value = { messaging_product, metadata:{ display_phone_number, phone_number_id },
//             contacts?:[{ profile:{ name }, wa_id }], messages?:[...], statuses?:[...] }
//   message = { from, id, timestamp, type, context?:{ id }, referral?:{...},
//               text?:{ body }, image?/video?/audio?/document?/sticker?:MediaObject,
//               contacts?:[...], reaction?:{ message_id, emoji }, ... }
//   MediaObject = { id, mime_type?, sha256?, caption?, filename?, voice?, ... }
import crypto from "node:crypto";
import { TipoMsg } from "../../generated/prisma/client";
import type {
  AcaoIngest,
  CanalAdapterEnvio,
  CapacidadesCanal,
  ConteudoCanonico,
  ContaCanal,
  EventoMensagem,
  IdentidadeExterna,
  OrigemAnuncio,
  ResultadoEnvioCanonico,
  SaidaCanonica,
} from "./tipos";

// ===========================================================================
// Tipos crus (parciais) do webhook da Meta — so o que lemos, o resto e ignorado.
// ===========================================================================
interface MediaObjectCloud {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}
interface MensagemCloud {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  context?: { id?: string };
  referral?: {
    source_url?: string;
    source_id?: string;
    source_type?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
  };
  text?: { body?: string };
  image?: MediaObjectCloud;
  video?: MediaObjectCloud;
  audio?: MediaObjectCloud;
  document?: MediaObjectCloud;
  sticker?: MediaObjectCloud;
  location?: { latitude?: unknown; longitude?: unknown; name?: string; address?: string };
  contacts?: Array<{
    name?: { formatted_name?: string };
    phones?: Array<{ phone?: string; wa_id?: string }>;
  }>;
  reaction?: { message_id?: string; emoji?: string };
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}
interface ContatoCloud {
  profile?: { name?: string };
  wa_id?: string;
}
interface StatusCloud {
  id?: string;
  status?: string;
}
interface ValueCloud {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: ContatoCloud[];
  messages?: MensagemCloud[];
  statuses?: StatusCloud[];
}
interface WebhookCloud {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: ValueCloud }> }>;
}

// Tipo do Cloud -> TipoMsg do dominio. Mesma intencao do mapearTipo da Evolution:
// sticker vira OUTRO (nao baixa .webp), contato/location tambem OUTRO.
function tipoDominioCloud(tipo: string | undefined): TipoMsg {
  switch (tipo) {
    case "text":
      return TipoMsg.TEXTO;
    case "audio":
      return TipoMsg.AUDIO;
    case "image":
      return TipoMsg.IMAGEM;
    case "video":
      return TipoMsg.VIDEO;
    case "document":
      return TipoMsg.DOCUMENTO;
    default:
      // sticker, contacts, location, interactive, button, order, system,
      // unsupported -> OUTRO (nao baixa midia; UI mostra placeholder de texto).
      return TipoMsg.OUTRO;
  }
}

function midiaDaMensagem(m: MensagemCloud): MediaObjectCloud | undefined {
  return m.image ?? m.video ?? m.audio ?? m.document ?? m.sticker;
}

// Conteudo legivel/curto por tipo — espelha a intencao do extrairConteudo da
// Evolution (legenda de midia, resumo de location/contato). midiaRef guarda o
// ID da midia do Cloud (o adaptador baixa via GET /<media-id> quando for F5).
function extrairConteudoCloud(m: MensagemCloud): ConteudoCanonico {
  const tipoDominio = tipoDominioCloud(m.type);
  const media = midiaDaMensagem(m);
  const ehSticker = !!m.sticker;

  let texto: string | null = null;
  if (m.type === "text") texto = m.text?.body ?? null;
  else if (media?.caption) texto = media.caption;
  else if (m.type === "location") {
    const nome = m.location?.name ?? m.location?.address ?? null;
    texto = nome ? `[localizacao] ${nome}` : "[localizacao]";
  }

  let contato: ConteudoCanonico["contato"] = null;
  if (m.type === "contacts" && m.contacts?.length) {
    const c0 = m.contacts[0];
    const nome = c0.name?.formatted_name?.trim() || "Contato";
    const tel = c0.phones?.find((p) => p.phone)?.phone ?? null;
    contato = { nome, telefone: tel, vcard: "" };
  }

  return {
    tipoDominio,
    texto,
    transcricao: null,
    // Sticker nunca carrega ref (mesma regra da Evolution). Demais midias: o id.
    midiaRef: ehSticker ? null : (media?.id ?? null),
    ehSticker,
    contato,
  };
}

function anuncioDaMensagem(m: MensagemCloud): OrigemAnuncio | null {
  const r = m.referral;
  if (!r) return null;
  return {
    ctwaClid: r.ctwa_clid ?? null,
    anuncioId: r.source_id ?? null,
    anuncioTitulo: r.headline ?? null,
    anuncioUrl: r.source_url ?? null,
    origemDetalhe: r.source_type ?? null,
  };
}

// PURO. Achata entry/changes/messages+statuses numa lista de acoes, na ordem em
// que a Meta as entrega. Uma mensagem -> uma acao; um status -> uma acao STATUS.
export function parseWebhookCloud(payload: unknown): AcaoIngest[] {
  const wh = payload as WebhookCloud | null | undefined;
  const acoes: AcaoIngest[] = [];
  if (!wh || !Array.isArray(wh.entry)) {
    return [{ acao: "IGNORAR", motivo: "cloud:payload-sem-entry" }];
  }

  for (const entry of wh.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") {
        acoes.push({ acao: "IGNORAR", motivo: `cloud:field-${change.field}` });
        continue;
      }
      const value = change.value;
      if (!value) continue;

      // wa_id -> nome do perfil (contacts vem separado das messages no Cloud).
      const nomePorWaId = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nomePorWaId.set(c.wa_id, c.profile.name);
      }

      for (const m of value.messages ?? []) {
        if (!m.id || !m.from) {
          acoes.push({ acao: "IGNORAR", motivo: "cloud:mensagem-sem-id-ou-from" });
          continue;
        }
        // Reacao NAO e mensagem: vira a mesma acao REACAO da Evolution.
        if (m.type === "reaction") {
          acoes.push({
            acao: "REACAO",
            alvoExternalId: m.reaction?.message_id ?? "",
            emoji: m.reaction?.emoji ?? "",
          });
          continue;
        }

        const telefone = m.from; // wa_id = telefone (digitos, com DDI, sem +)
        const cliente: IdentidadeExterna = {
          tipo: "TELEFONE",
          valor: telefone,
          telefone,
          nomePerfil: nomePorWaId.get(telefone),
        };
        const ocorridoEm = m.timestamp
          ? new Date(Number(m.timestamp) * 1000)
          : undefined;

        const evento: EventoMensagem = {
          provider: "CLOUD_API",
          externalId: m.id,
          direcao: "IN", // Cloud nunca ecoa OUT como "message" (isso vem em statuses)
          ocorridoEm:
            ocorridoEm && !Number.isNaN(ocorridoEm.getTime())
              ? ocorridoEm
              : undefined,
          contaRef: value.metadata?.phone_number_id ?? "",
          cliente,
          conteudo: extrairConteudoCloud(m),
          respondeA: m.context?.id ?? null,
          origemAnuncio: anuncioDaMensagem(m),
          raw: m,
        };
        acoes.push({ acao: "MENSAGEM", evento });
      }

      for (const _s of value.statuses ?? []) {
        // Status de entrega (sent/delivered/read/failed). Mesmo tratamento
        // canonico da Evolution; o wiring do handler de status do Cloud e F5.
        acoes.push({ acao: "STATUS" });
      }
    }
  }

  if (acoes.length === 0) {
    return [{ acao: "IGNORAR", motivo: "cloud:webhook-sem-mensagens-nem-status" }];
  }
  return acoes;
}

// ===========================================================================
// Validacao de assinatura do webhook (X-Hub-Signature-256).
// HMAC-SHA256 do corpo CRU usando o App Secret; header "sha256=<hex>".
// ===========================================================================
export function verificarAssinaturaCloud(
  rawBody: string,
  headerAssinatura: string | null | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !headerAssinatura) return false;
  const esperado =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(headerAssinatura);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ===========================================================================
// Envio via Cloud API. So dispara com uma ContaCanal CLOUD_API real + token no
// ambiente — nada disso existe ate o F5, entao na pratica retorna CONFIG_AUSENTE
// sem tocar a rede. exigeTemplateForaDaJanela=true (regra da janela de 24h).
// ===========================================================================
export const capacidadesCloud: CapacidadesCanal = {
  texto: true,
  midia: true,
  audioPTT: true,
  reacao: true,
  edicao: false,
  revogar: false,
  contato: true,
  exigeTemplateForaDaJanela: true,
};

const VERSAO_GRAPH = process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0";

// midiaRef pode ser URL publica (usa `link`) ou id de midia ja no Cloud (`id`).
function refMidiaCloud(midiaRef: string): { link: string } | { id: string } {
  return /^https?:\/\//i.test(midiaRef) ? { link: midiaRef } : { id: midiaRef };
}

function corpoEnvioCloud(
  destino: IdentidadeExterna,
  saida: SaidaCanonica,
): Record<string, unknown> | null {
  const to = destino.telefone ?? destino.valor;
  const base: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };
  if (saida.citarExternalId) base.context = { message_id: saida.citarExternalId };

  switch (saida.tipo) {
    case "TEXTO":
      if (!saida.texto) return null;
      return { ...base, type: "text", text: { preview_url: false, body: saida.texto } };
    case "IMAGEM":
      if (!saida.midiaRef) return null;
      return {
        ...base,
        type: "image",
        image: { ...refMidiaCloud(saida.midiaRef), ...(saida.texto ? { caption: saida.texto } : {}) },
      };
    case "VIDEO":
      if (!saida.midiaRef) return null;
      return {
        ...base,
        type: "video",
        video: { ...refMidiaCloud(saida.midiaRef), ...(saida.texto ? { caption: saida.texto } : {}) },
      };
    case "DOCUMENTO":
      if (!saida.midiaRef) return null;
      return {
        ...base,
        type: "document",
        document: {
          ...refMidiaCloud(saida.midiaRef),
          ...(saida.texto ? { caption: saida.texto } : {}),
          ...(saida.fileName ? { filename: saida.fileName } : {}),
        },
      };
    case "AUDIO":
      if (!saida.midiaRef) return null;
      return { ...base, type: "audio", audio: refMidiaCloud(saida.midiaRef) };
    case "CONTATO":
      if (!saida.contato) return null;
      return {
        ...base,
        type: "contacts",
        contacts: [
          {
            name: { formatted_name: saida.contato.nome, first_name: saida.contato.nome },
            phones: [{ phone: saida.contato.telefone, type: "CELL" }],
          },
        ],
      };
  }
}

async function enviarCloud(
  conta: ContaCanal,
  destino: IdentidadeExterna,
  saida: SaidaCanonica,
): Promise<ResultadoEnvioCanonico> {
  const token = process.env[conta.credencialRef ?? "WHATSAPP_CLOUD_TOKEN"];
  const phoneNumberId = conta.refExterna;
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      motivo: "CONFIG_AUSENTE",
      detalhe: "token do Cloud (credencialRef) ou phone_number_id ausente",
    };
  }
  const corpo = corpoEnvioCloud(destino, saida);
  if (!corpo) {
    return {
      ok: false,
      motivo: "RECUSADO_PELO_CANAL",
      detalhe: "saida sem conteudo para o tipo informado",
    };
  }

  try {
    const resp = await fetch(
      `https://graph.facebook.com/${VERSAO_GRAPH}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
      },
    );
    const raw = (await resp.json().catch(() => null)) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    } | null;
    if (!resp.ok) {
      return {
        ok: false,
        motivo: resp.status >= 500 ? "ERRO_TRANSITORIO" : "RECUSADO_PELO_CANAL",
        detalhe: raw?.error?.message ?? `status ${resp.status}`,
        raw,
      };
    }
    return { ok: true, externalId: raw?.messages?.[0]?.id, raw };
  } catch (e) {
    return {
      ok: false,
      motivo: "ERRO_TRANSITORIO",
      detalhe: e instanceof Error ? e.message : String(e),
    };
  }
}

export const adapterEnvioCloud: CanalAdapterEnvio = {
  provider: "CLOUD_API",
  capacidades: capacidadesCloud,
  enviar: enviarCloud,
};

// Cliente minimo da Evolution API. Nenhuma conexao no topo do modulo; tudo
// lido de env em runtime. As funcoes aceitam a instancia (numero) a usar.
type ResultadoEnvio = {
  ok: boolean;
  externalId?: string;
  status?: number;
  raw: unknown;
};

export function baseEKey(): { base: string; apikey: string } | null {
  const base = process.env.EVOLUTION_BASE_URL;
  const apikey = process.env.EVOLUTION_API_KEY;
  if (!base || !apikey) return null;
  return { base: base.replace(/\/$/, ""), apikey };
}

// Envia uma mensagem de texto por uma instancia especifica (ou a padrao do env).
// Endpoint: POST {BASE}/message/sendText/{INSTANCE}  header apikey.
export async function enviarTexto(
  numero: string,
  texto: string,
  instancia?: string | null,
  // Reply (Fatia 2.85): cita a mensagem respondida (key da Evolution).
  quoted?: { id: string; remoteJid: string; fromMe: boolean },
): Promise<ResultadoEnvio> {
  const cfg = baseEKey();
  const instance = instancia || process.env.EVOLUTION_INSTANCE;
  if (!cfg || !instance) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }

  const url = `${cfg.base}/message/sendText/${instance}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({
        number: numero,
        text: texto,
        ...(quoted
          ? {
              quoted: {
                key: {
                  id: quoted.id,
                  remoteJid: quoted.remoteJid,
                  fromMe: quoted.fromMe,
                },
              },
            }
          : {}),
      }),
    });
    const raw: unknown = await resp.json().catch(() => null);
    if (!resp.ok) return { ok: false, status: resp.status, raw };
    const externalId =
      typeof raw === "object" && raw !== null
        ? (raw as { key?: { id?: string } }).key?.id
        : undefined;
    return { ok: true, externalId, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

// Envia uma mensagem de VOZ (PTT) por uma instancia especifica (ou a do env).
// Endpoint: POST {BASE}/message/sendWhatsAppAudio/{INSTANCE}  header apikey.
// `audio` aceita base64 (sem data: prefix) OU uma URL publica do arquivo.
export async function enviarAudio(
  numero: string,
  audio: string,
  instancia?: string | null,
  delayMs?: number,
): Promise<ResultadoEnvio> {
  const cfg = baseEKey();
  const instance = instancia || process.env.EVOLUTION_INSTANCE;
  if (!cfg || !instance) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }

  const url = `${cfg.base}/message/sendWhatsAppAudio/${instance}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({
        number: numero,
        audio,
        ...(delayMs ? { delay: delayMs } : {}),
      }),
    });
    const raw: unknown = await resp.json().catch(() => null);
    if (!resp.ok) return { ok: false, status: resp.status, raw };
    const externalId =
      typeof raw === "object" && raw !== null
        ? (raw as { key?: { id?: string } }).key?.id
        : undefined;
    return { ok: true, externalId, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

// Envia midia (imagem/video/documento) por uma instancia. Evolution v2:
// POST {BASE}/message/sendMedia/{INSTANCE}  body { number, mediatype, media, ...}.
// `media` aceita URL publica OU base64. Audio (voz/PTT) usa enviarAudio.
export async function enviarMidia(
  numero: string,
  media: string,
  mediatype: "image" | "video" | "document",
  instancia?: string | null,
  opts?: { fileName?: string; caption?: string; mimetype?: string },
): Promise<ResultadoEnvio> {
  const cfg = baseEKey();
  const instance = instancia || process.env.EVOLUTION_INSTANCE;
  if (!cfg || !instance) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }
  const url = `${cfg.base}/message/sendMedia/${instance}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({
        number: numero,
        mediatype,
        media,
        ...(opts?.fileName ? { fileName: opts.fileName } : {}),
        ...(opts?.caption ? { caption: opts.caption } : {}),
        ...(opts?.mimetype ? { mimetype: opts.mimetype } : {}),
      }),
    });
    const raw: unknown = await resp.json().catch(() => null);
    if (!resp.ok) return { ok: false, status: resp.status, raw };
    const externalId =
      typeof raw === "object" && raw !== null
        ? (raw as { key?: { id?: string } }).key?.id
        : undefined;
    return { ok: true, externalId, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

// Envia um CONTATO (vCard) por uma instancia. Evolution v2:
// POST {BASE}/message/sendContact/{instance} body { number, contact:[{fullName,wuid,phoneNumber}] }.
// Se o endpoint nao existir/falhar, o chamador degrada para texto formatado.
export async function enviarContato(
  numero: string,
  instancia: string | null | undefined,
  contato: { nome: string; telefone: string },
): Promise<ResultadoEnvio> {
  const cfg = baseEKey();
  const instance = instancia || process.env.EVOLUTION_INSTANCE;
  if (!cfg || !instance) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }
  const digitos = contato.telefone.replace(/\D/g, "");
  try {
    const resp = await fetch(`${cfg.base}/message/sendContact/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({
        number: numero,
        contact: [
          {
            fullName: contato.nome,
            wuid: digitos,
            phoneNumber: contato.telefone,
          },
        ],
      }),
    });
    const raw: unknown = await resp.json().catch(() => null);
    if (!resp.ok) return { ok: false, status: resp.status, raw };
    const externalId =
      typeof raw === "object" && raw !== null
        ? (raw as { key?: { id?: string } }).key?.id
        : undefined;
    return { ok: true, externalId, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

// POST {BASE}/message/sendReaction/{INSTANCE} body { key, reaction }. Reage a uma
// mensagem (emoji). reaction "" remove a reacao (toggle, como no WhatsApp). O key
// identifica a mensagem alvo: { id: externalId, remoteJid, fromMe }.
export async function enviarReacao(
  instancia: string | null | undefined,
  key: { id: string; remoteJid: string; fromMe: boolean },
  emoji: string,
): Promise<{ ok: boolean; status?: number; raw: unknown }> {
  const cfg = baseEKey();
  const instance = instancia || process.env.EVOLUTION_INSTANCE;
  if (!cfg || !instance) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }
  try {
    const resp = await fetch(`${cfg.base}/message/sendReaction/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({
        key: { id: key.id, remoteJid: key.remoteJid, fromMe: key.fromMe },
        reaction: emoji,
      }),
    });
    const raw = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

// Baixa a midia de uma mensagem (base64) via Evolution.
// Evolution v2: POST {BASE}/chat/getBase64FromMediaMessage/{instance} espera o
// OBJETO DE MENSAGEM COMPLETO no campo `message` — { key, message, ... } —, ou
// seja, o proprio `data` do evento webhook. Aqui recebemos esse objeto e o
// repassamos como `message`. Retorna { base64, mimetype } ou null (sem config /
// erro / sem midia). Loga status + corpo truncado quando falha (prefixo [midia]).
export async function baixarMidiaBase64(
  instancia: string,
  mensagem: { key?: unknown; message?: unknown },
): Promise<{ base64: string; mimetype: string | null } | null> {
  const cfg = baseEKey();
  if (!cfg || !instancia) {
    console.warn("[midia] download abortado: config Evolution/instancia ausente");
    return null;
  }
  try {
    const resp = await fetch(
      `${cfg.base}/chat/getBase64FromMediaMessage/${instancia}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.apikey },
        // convertToMp4: false preserva o formato original (audio ogg etc.).
        body: JSON.stringify({ message: mensagem, convertToMp4: false }),
      },
    );
    // Chaves de 1o nivel do message (revela o tipo/envelope: stickerMessage,
    // ephemeralMessage, viewOnceMessage...). Ajuda a diagnosticar falhas. 2.95.
    const tiposMsg =
      mensagem?.message && typeof mensagem.message === "object"
        ? Object.keys(mensagem.message as Record<string, unknown>).join(",")
        : "(sem message)";
    if (!resp.ok) {
      const corpo = (await resp.text().catch(() => "")).slice(0, 1000);
      console.warn(
        `[midia] getBase64 FALHOU status ${resp.status} tipos=[${tiposMsg}] corpo=${corpo || "(sem corpo)"}`,
      );
      return null;
    }
    const raw = (await resp.json().catch(() => null)) as {
      base64?: string;
      mimetype?: string;
    } | null;
    if (!raw?.base64) {
      console.warn(
        `[midia] getBase64 sem base64 tipos=[${tiposMsg}] mimetype=${raw?.mimetype ?? "?"}`,
      );
      return null;
    }
    return { base64: raw.base64, mimetype: raw.mimetype ?? null };
  } catch (erro) {
    console.warn(
      `[midia] erro de rede no getBase64: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return null;
  }
}

// Revoga (apaga para todos) uma mensagem propria ja enviada.
// Evolution v2: DELETE {BASE}/chat/deleteMessageForEveryone/{instance}
// body { id, remoteJid, fromMe, participant? }. Nunca lanca.
export async function revogarMensagem(
  instancia: string | null | undefined,
  dados: { id: string; remoteJid: string; fromMe: boolean; participant?: string },
): Promise<{ ok: boolean; status?: number; raw: unknown }> {
  const cfg = baseEKey();
  const instance = instancia || process.env.EVOLUTION_INSTANCE;
  if (!cfg || !instance) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }
  try {
    const resp = await fetch(
      `${cfg.base}/chat/deleteMessageForEveryone/${instance}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", apikey: cfg.apikey },
        body: JSON.stringify({
          id: dados.id,
          remoteJid: dados.remoteJid,
          fromMe: dados.fromMe,
          ...(dados.participant ? { participant: dados.participant } : {}),
        }),
      },
    );
    const raw = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

// Edita uma mensagem JA ENVIADA (estilo WhatsApp). Evolution v2:
// POST {BASE}/chat/updateMessage/{instance} body { number, text, key:{id,remoteJid,fromMe} }.
// O WhatsApp permite editar por ~15 min; a validacao de tempo fica no endpoint.
export async function editarMensagem(
  instancia: string | null | undefined,
  numero: string,
  dados: { id: string; remoteJid: string; fromMe: boolean },
  texto: string,
): Promise<{ ok: boolean; status?: number; raw: unknown }> {
  const cfg = baseEKey();
  const instance = instancia || process.env.EVOLUTION_INSTANCE;
  if (!cfg || !instance) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }
  try {
    const resp = await fetch(`${cfg.base}/chat/updateMessage/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({
        number: numero,
        text: texto,
        key: { id: dados.id, remoteJid: dados.remoteJid, fromMe: dados.fromMe },
      }),
    });
    const raw = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

// Busca a URL da foto de perfil de um numero no WhatsApp.
// POST {BASE}/chat/fetchProfilePictureUrl/{instance}  body { number }.
// Retorna a URL ou null (sem foto / erro / config ausente) — nunca lanca.
// A URL do WhatsApp expira; re-buscar quando necessario (endpoint de refresh).
export async function fetchFotoPerfil(
  instancia: string,
  numero: string,
): Promise<string | null> {
  const cfg = baseEKey();
  if (!cfg || !instancia || !numero) return null;
  try {
    const resp = await fetch(
      `${cfg.base}/chat/fetchProfilePictureUrl/${instancia}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.apikey },
        body: JSON.stringify({ number: numero }),
      },
    );
    if (!resp.ok) return null;
    const raw = (await resp.json().catch(() => null)) as {
      profilePictureUrl?: string | null;
    } | null;
    const url = raw?.profilePictureUrl;
    return typeof url === "string" && url ? url : null;
  } catch {
    return null;
  }
}

// Metadata de um grupo (@g.us): assunto (subject) e foto. Usado para nomear os
// grupos internos. GET {BASE}/group/findGroupInfos/{instance}?groupJid=...
// Nunca lanca; retorna null quando indisponivel.
export async function metadataGrupo(
  instancia: string,
  jid: string,
): Promise<{ subject: string | null; fotoUrl: string | null } | null> {
  const cfg = baseEKey();
  if (!cfg || !instancia || !jid) return null;
  try {
    const resp = await fetch(
      `${cfg.base}/group/findGroupInfos/${instancia}?groupJid=${encodeURIComponent(jid)}`,
      { headers: { apikey: cfg.apikey } },
    );
    if (!resp.ok) return null;
    const raw = (await resp.json().catch(() => null)) as {
      subject?: string | null;
      pictureUrl?: string | null;
      profilePicUrl?: string | null;
    } | null;
    if (!raw) return null;
    const subject =
      typeof raw.subject === "string" && raw.subject ? raw.subject : null;
    const foto = raw.pictureUrl ?? raw.profilePicUrl ?? null;
    return { subject, fotoUrl: typeof foto === "string" && foto ? foto : null };
  } catch {
    return null;
  }
}

// Sai de um grupo (@g.us) no WhatsApp pela instancia dada. Evolution v2:
// DELETE {BASE}/group/leaveGroup/{instance}?groupJid=...  Nunca lanca.
export async function sairGrupo(
  jid: string,
  instancia: string | null | undefined,
): Promise<{ ok: boolean; status?: number; raw: unknown }> {
  const cfg = baseEKey();
  const instance = instancia || process.env.EVOLUTION_INSTANCE;
  if (!cfg || !instance) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }
  try {
    const resp = await fetch(
      `${cfg.base}/group/leaveGroup/${instance}?groupJid=${encodeURIComponent(jid)}`,
      { method: "DELETE", headers: { apikey: cfg.apikey } },
    );
    const raw = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

// Estado de conexao de uma instancia: GET /instance/connectionState/{instance}.
// Retorna "open" | "close" | "connecting" | "desconhecido".
export async function estadoConexao(instancia: string): Promise<string> {
  const cfg = baseEKey();
  if (!cfg) return "sem_config";
  try {
    const resp = await fetch(
      `${cfg.base}/instance/connectionState/${instancia}`,
      { headers: { apikey: cfg.apikey } },
    );
    if (!resp.ok) return "desconhecido";
    const raw = (await resp.json().catch(() => null)) as {
      instance?: { state?: string };
      state?: string;
    } | null;
    return raw?.instance?.state ?? raw?.state ?? "desconhecido";
  } catch {
    return "desconhecido";
  }
}

// Configura o webhook da instancia apontando para a nossa rota de ingestao.
// POST /webhook/set/{instance} com headers x-webhook-secret e evento MESSAGES_UPSERT.
export async function configurarWebhook(
  instancia: string,
  url: string,
  secret: string,
): Promise<{ ok: boolean; status?: number; raw: unknown }> {
  const cfg = baseEKey();
  if (!cfg) return { ok: false, raw: { erro: "config Evolution ausente" } };
  try {
    const resp = await fetch(`${cfg.base}/webhook/set/${instancia}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url,
          headers: { "x-webhook-secret": secret },
          byEvents: false,
          base64: false,
          // UPSERT = mensagens; UPDATE/DELETE = status e revogacoes (apagar).
          // CALL ainda e assinado (o webhook recebe), mas e IGNORADO desde a
          // fatia 2.77 — a secao de Chamadas foi removida (sem persistir nada).
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE", "CALL"],
        },
      }),
    });
    const raw = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

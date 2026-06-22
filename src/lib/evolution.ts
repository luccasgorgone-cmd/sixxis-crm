// Cliente minimo da Evolution API. Nenhuma conexao no topo do modulo; tudo
// lido de env em runtime. As funcoes aceitam a instancia (numero) a usar.
type ResultadoEnvio = {
  ok: boolean;
  externalId?: string;
  status?: number;
  raw: unknown;
};

function baseEKey(): { base: string; apikey: string } | null {
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
      body: JSON.stringify({ number: numero, text: texto }),
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
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE"],
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

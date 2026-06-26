// Meta Conversions API (server-side). Envia o evento "Purchase" quando um
// negocio e marcado GANHO com valor, atribuindo a conversao ao anuncio de
// origem (ctwaClid). Dados pessoais sao HASHEADOS (SHA-256) conforme exigencia
// do Meta. Pixel ID + token vem da config segura (ConfiguracaoCRM), nunca do
// browser. Sem config => no-op (nao quebra o fluxo de venda).
import crypto from "node:crypto";
import { prisma } from "./prisma";

const GRAPH_VERSION = "v19.0";

type ConfigMeta = {
  pixelId: string;
  token: string;
  testEventCode: string | null;
};

async function lerConfig(): Promise<ConfigMeta | null> {
  const cfg = await prisma.configuracaoCRM.findFirst({
    select: { metaPixelId: true, metaCapiToken: true, metaTestEventCode: true },
  });
  if (!cfg?.metaPixelId || !cfg?.metaCapiToken) return null;
  return {
    pixelId: cfg.metaPixelId,
    token: cfg.metaCapiToken,
    testEventCode: cfg.metaTestEventCode || null,
  };
}

function sha256(valor: string): string {
  return crypto.createHash("sha256").update(valor).digest("hex");
}

// Normaliza + hasheia dados pessoais conforme o Meta (lowercase/trim; telefone
// so digitos). Retorna undefined quando o dado nao existe (nao envia hash vazio).
function hashEmail(email?: string | null): string[] | undefined {
  const e = (email ?? "").trim().toLowerCase();
  return e ? [sha256(e)] : undefined;
}
function hashTelefone(telefone?: string | null): string[] | undefined {
  const t = (telefone ?? "").replace(/\D/g, "");
  return t ? [sha256(t)] : undefined;
}
function hashNome(nome?: string | null): string[] | undefined {
  const n = (nome ?? "").trim().toLowerCase();
  return n ? [sha256(n)] : undefined;
}

export type ResultadoCapi = {
  ok: boolean;
  status?: number;
  motivo?: string;
  raw?: unknown;
};

// Dispara o evento Purchase para a Graph API (Conversions API).
export async function dispararPurchase(opts: {
  ctwaClid?: string | null;
  valor: number;
  moeda?: string;
  eventId: string;
  telefone?: string | null;
  email?: string | null;
  nome?: string | null;
  eventTime?: number; // epoch segundos (default: agora seria nao-deterministico)
}): Promise<ResultadoCapi> {
  const cfg = await lerConfig();
  if (!cfg) return { ok: false, motivo: "Meta CAPI nao configurado" };

  const userData: Record<string, unknown> = {};
  const ph = hashTelefone(opts.telefone);
  const em = hashEmail(opts.email);
  const fn = hashNome(opts.nome);
  if (ph) userData.ph = ph;
  if (em) userData.em = em;
  if (fn) userData.fn = fn;
  if (opts.ctwaClid) userData.ctwa_clid = opts.ctwaClid;

  const evento: Record<string, unknown> = {
    event_name: "Purchase",
    event_time: opts.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: opts.eventId, // deduplicacao
    // Conversao originada de mensageria (Click-to-WhatsApp).
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: userData,
    custom_data: { value: opts.valor, currency: opts.moeda ?? "BRL" },
  };

  const body: Record<string, unknown> = { data: [evento] };
  if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.token)}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await resp.json().catch(() => null);
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        motivo: "falha na Graph API",
        raw,
      };
    }
    return { ok: true, status: resp.status, raw };
  } catch (erro) {
    return {
      ok: false,
      motivo: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

// Testa a conexao com a Graph API validando o Pixel ID + token (GET do pixel).
// Aceita config passada (antes de salvar) ou usa a salva.
export async function testarConexaoMeta(override?: {
  pixelId?: string | null;
  token?: string | null;
}): Promise<ResultadoCapi> {
  let pixelId = override?.pixelId ?? null;
  let token = override?.token ?? null;
  if (!pixelId || !token) {
    const cfg = await lerConfig();
    pixelId = pixelId ?? cfg?.pixelId ?? null;
    token = token ?? cfg?.token ?? null;
  }
  if (!pixelId || !token) {
    return { ok: false, motivo: "Informe Pixel ID e token" };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}?fields=id,name&access_token=${encodeURIComponent(token)}`;
  try {
    const resp = await fetch(url);
    const raw = (await resp.json().catch(() => null)) as
      | { id?: string; name?: string; error?: { message?: string } }
      | null;
    if (!resp.ok || raw?.error) {
      return {
        ok: false,
        status: resp.status,
        motivo: raw?.error?.message ?? "credenciais invalidas",
        raw,
      };
    }
    return { ok: true, status: resp.status, raw };
  } catch (erro) {
    return {
      ok: false,
      motivo: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

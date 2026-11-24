// Meta Conversions API (server-side). Envia o evento "Purchase" quando um
// negocio e marcado GANHO com valor, atribuindo a conversao ao anuncio de
// origem (ctwaClid). Dados pessoais sao HASHEADOS (SHA-256) conforme exigencia
// do Meta. Pixel ID + token vem da config segura (ConfiguracaoCRM), nunca do
// browser. Sem config => no-op (nao quebra o fluxo de venda).
import crypto from "node:crypto";
import { prisma } from "./prisma";
import { lerConfigCRM } from "./configCrm";

const GRAPH_VERSION = "v19.0";

// Pagina do Facebook vinculada ao WhatsApp Business. OBRIGATORIO em eventos
// action_source=business_messaging: a Graph API rejeita (error subcode 2804116)
// sem user_data.page_id OU user_data.whatsapp_business_account_id. Default =
// Pagina "Sixxis do Brasil" (unica do business); override por env META_PAGE_ID.
const META_PAGE_ID = process.env.META_PAGE_ID || "113494068344928";

type ConfigMeta = {
  pixelId: string;
  token: string;
  testEventCode: string | null;
};

async function lerConfig(): Promise<ConfigMeta | null> {
  const cfg = await lerConfigCRM();
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

export type DadosUsuarioCapi = {
  telefone?: string | null;
  email?: string | null;
  nome?: string | null;
  ctwaClid?: string | null;
  leadId?: string | null; // vira external_id (SHA-256), ajuda dedup/match
};

// Monta o user_data do evento: hasheia (SHA-256) so o que existe, inclui
// ctwa_clid e external_id (hash do id do Lead) quando presentes e SEMPRE
// page_id (obrigatorio em business_messaging). Puro/deterministico.
export function montarUserData(dados: DadosUsuarioCapi): Record<string, unknown> {
  const userData: Record<string, unknown> = {};
  const ph = hashTelefone(dados.telefone);
  const em = hashEmail(dados.email);
  const fn = hashNome(dados.nome);
  if (ph) userData.ph = ph;
  if (em) userData.em = em;
  if (fn) userData.fn = fn;
  if (dados.ctwaClid) userData.ctwa_clid = dados.ctwaClid;
  // external_id = hash do id interno do Lead (opaco, nao PII legivel). Melhora
  // a deduplicacao e o match de vendas do mesmo cliente no Meta.
  const lid = (dados.leadId ?? "").trim();
  if (lid) userData.external_id = [sha256(lid)];
  // Obrigatorio para action_source=business_messaging (vide META_PAGE_ID acima).
  // Nao e hasheado (identificador da Pagina, nao PII). Enviado sempre.
  userData.page_id = META_PAGE_ID;
  return userData;
}

// Monta o evento Purchase. event_time DEVE ser a hora do GANHO (epoch seg) para
// o evento cair no dia certo mesmo em reenvio/retry; so cai pra "agora" quando
// nao informado. Puro/deterministico (nao faz rede nem le config).
export function montarEventoPurchase(opts: {
  valor: number;
  moeda?: string;
  eventId: string;
  eventTime?: number;
} & DadosUsuarioCapi): Record<string, unknown> {
  return {
    event_name: "Purchase",
    event_time: opts.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: opts.eventId, // deduplicacao
    // Conversao originada de mensageria (Click-to-WhatsApp).
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: montarUserData(opts),
    custom_data: { value: opts.valor, currency: opts.moeda ?? "BRL" },
  };
}

// Extrai os campos de medicao da resposta da Graph (Conversions API). Tolera
// raw nulo/sem campos. events_received + fbtrace_id sao o que o Marketing usa
// pra conferir no Events Manager; messages[] traz avisos/erros de validacao.
export function extrairRespostaGraph(raw: unknown): {
  eventsReceived: number | null;
  fbtraceId: string | null;
  messages: unknown[] | null;
} {
  if (!raw || typeof raw !== "object") {
    return { eventsReceived: null, fbtraceId: null, messages: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    eventsReceived:
      typeof r.events_received === "number" ? r.events_received : null,
    fbtraceId: typeof r.fbtrace_id === "string" ? r.fbtrace_id : null,
    messages: Array.isArray(r.messages) ? r.messages : null,
  };
}

// Dispara o evento Purchase para a Graph API (Conversions API).
export async function dispararPurchase(opts: {
  ctwaClid?: string | null;
  valor: number;
  moeda?: string;
  eventId: string;
  telefone?: string | null;
  email?: string | null;
  nome?: string | null;
  leadId?: string | null; // vira external_id (SHA-256)
  eventTime?: number; // epoch segundos (hora do GANHO; default agora)
}): Promise<ResultadoCapi> {
  const cfg = await lerConfig();
  if (!cfg) return { ok: false, motivo: "Meta CAPI nao configurado" };

  const evento = montarEventoPurchase(opts);

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

// Origens que representam um PEDIDO FEITO NO SITE/LOJA (Mercado Pago etc.).
// Esse fluxo ja dispara seu proprio Purchase, entao o CRM NAO deve mandar um
// segundo evento ao virar GANHO — evita dupla contagem no Meta. Comparacao
// case-insensitive; valor desconhecido/whatsapp/manual => false (dispara normal).
const ORIGENS_SITE = new Set([
  "site",
  "loja",
  "pedido_site",
  "pedido-site",
  "ecommerce",
  "e-commerce",
]);

export function ehPedidoDoSite(origem?: string | null): boolean {
  if (!origem) return false;
  return ORIGENS_SITE.has(origem.trim().toLowerCase());
}

// Log de auditoria de cada tentativa de Purchase (enviada OU pulada). Best-effort:
// nunca derruba o fluxo de venda — se o insert falhar, so avisa no console.
export async function registrarEventoCapi(opts: {
  negocioId?: string | null;
  eventName?: string;
  eventId: string;
  actionSource?: string;
  valor?: number | null;
  moeda?: string | null;
  ctwaClid?: string | null;
  anuncioId?: string | null;
  pulado?: boolean;
  motivoPulo?: string | null;
  ok?: boolean;
  status?: number | null;
  motivo?: string | null;
  // Resposta da Graph (medicao): guardada so no caminho de envio real.
  raw?: unknown;
}): Promise<void> {
  try {
    const graph = extrairRespostaGraph(opts.raw);
    await prisma.eventoCapi.create({
      data: {
        negocioId: opts.negocioId ?? null,
        eventName: opts.eventName ?? "Purchase",
        eventId: opts.eventId,
        actionSource: opts.actionSource ?? "business_messaging",
        valor: opts.valor ?? null,
        moeda: opts.moeda ?? null,
        ctwaClid: opts.ctwaClid ?? null,
        anuncioId: opts.anuncioId ?? null,
        pulado: opts.pulado ?? false,
        motivoPulo: opts.motivoPulo ?? null,
        ok: opts.ok ?? false,
        status: opts.status ?? null,
        motivo: opts.motivo ?? null,
        eventsReceived: graph.eventsReceived,
        fbtraceId: graph.fbtraceId,
        graphRaw: opts.raw != null ? JSON.stringify(opts.raw) : null,
      },
    });
  } catch (erro) {
    console.warn("[metaCapi] falha ao registrar EventoCapi:", erro);
  }
}

// Cliente server-side da cobranca de pagamento da Loja (Fase 3). Consome as rotas
// INTERNAS da sixxis-store que integram o Mercado Pago — o TOKEN do MP vive SO na
// Loja; o CRM nunca o tem. REUSA a mesma config do loja.ts/freteLoja.ts
// (STORE_API_URL + STORE_INTERNAL_KEY, header x-internal-key). A chave nunca vai
// ao browser.
//
// TRAVA: pagamento e sensivel, mas o link nunca deve derrubar o fluxo do
// atendimento — erro/timeout/loja-off retornam { ok:false, mensagem } SEM lançar.

export type PagadorLoja = { nome?: string; email?: string };

export type CriarCobrancaBody = {
  referencia: string; // vira external_reference "crm-{referencia}" na Loja
  descricao: string;
  valor: number;
  notificationUrl: string; // https absoluto -> webhook do CRM
  pagador?: PagadorLoja;
};

export type CriarCobrancaResp = {
  ok: boolean;
  preferenceId?: string;
  initPoint?: string;
  externalReference?: string;
  mensagem?: string;
};

// Consulta de status de um pagamento no MP, via Loja (que detem o token). READ-ONLY.
export type ConsultarPagamentoResp = {
  ok: boolean;
  status?: string | null; // status do MP: "approved" | "pending" | "rejected" | ...
  externalReference?: string | null;
  valor?: number | null;
  mensagem?: string;
};

function baseConfig(): { base: string; key: string } | null {
  const base = process.env.STORE_API_URL;
  const key = process.env.STORE_INTERNAL_KEY;
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ""), key };
}

const TIMEOUT_MS = 8_000;

async function postInterno<T>(caminho: string, corpo: unknown): Promise<T | null> {
  const cfg = baseConfig();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${cfg.base}${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": cfg.key },
      body: JSON.stringify(corpo),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Gera o LINK de pagamento (Checkout Pro) na Loja. Nunca lança.
export async function criarCobranca(body: CriarCobrancaBody): Promise<CriarCobrancaResp> {
  const d = await postInterno<CriarCobrancaResp>(
    "/api/interno/pagamento/criar-cobranca",
    body,
  );
  if (!d) return { ok: false, mensagem: "pagamento indisponível" };
  return { ...d, ok: d.ok === true };
}

// Confirma o status de um pagamento no MP via Loja (read-only). Nunca lança.
// Usado pelo webhook do CRM para NAO confiar cegamente na notificacao do MP.
// A Loja expoe POST /api/interno/pagamento/consultar { mpPaymentId }.
export async function consultarPagamento(
  mpPaymentId: string,
): Promise<ConsultarPagamentoResp> {
  const d = await postInterno<ConsultarPagamentoResp>(
    "/api/interno/pagamento/consultar",
    { mpPaymentId },
  );
  if (!d) return { ok: false, mensagem: "consulta indisponível" };
  return { ...d, ok: d.ok === true };
}

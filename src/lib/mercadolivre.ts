// Integracao OAuth com o Mercado Livre. Os TOKENS ficam no banco (singleton
// IntegracaoMercadoLivre, id "ml"); as credenciais do APP vem de env e NUNCA sao
// commitadas: ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI. Nada de secret em
// log/resposta. Usada pelas rotas de OAuth e pelo endpoint de tendencias.
import { prisma } from "./prisma";

export const ML_ID = "ml"; // id fixo do singleton
const TIMEOUT_MS = 12_000;
const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const TRENDS_URL = "https://api.mercadolibre.com/trends/MLB";

// Cache persistente das tendencias reusando ClimaCacheUF (uf="ML", dias=-4).
// Os dados do ML sao semanais -> TTL 6h e mais que suficiente.
export const UF_ML = "ML";
export const DIAS_ML = -4;
export const TTL_ML_MS = 6 * 60 * 60 * 1000;

export type ItemTrendML = { keyword: string; url: string };

// Busca as ~50 buscas mais populares (site MLB). Nunca lanca: null em falha.
export async function buscarTendenciasML(
  token: string,
): Promise<ItemTrendML[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(TRENDS_URL, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    if (!Array.isArray(j)) return null;
    const itens = j
      .filter((x) => x && typeof x.keyword === "string")
      .map((x) => ({
        keyword: x.keyword as string,
        url: typeof x.url === "string" ? (x.url as string) : "",
      }))
      .slice(0, 50);
    return itens.length ? itens : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type EnvML = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

// Credenciais do app (env). Retorna null se qualquer uma faltar (rota responde 503).
export function envML(): EnvML | null {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

// URL de autorizacao (inicio do fluxo). state anti-CSRF vai no cookie e aqui.
export function urlAutorizacao(env: EnvML, state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

type TokenResp = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
};

async function postToken(
  params: Record<string, string>,
): Promise<TokenResp | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as TokenResp;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Persiste os tokens no singleton. expiraEm = agora + expires_in (default 6h).
async function salvarTokens(t: TokenResp, conectar: boolean): Promise<void> {
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + (t.expires_in ?? 21600) * 1000);
  const dados = {
    accessToken: t.access_token ?? null,
    refreshToken: t.refresh_token ?? null,
    expiraEm,
    mlUserId: t.user_id != null ? String(t.user_id) : null,
    ...(conectar ? { conectadoEm: agora } : {}),
  };
  await prisma.integracaoMercadoLivre.upsert({
    where: { id: ML_ID },
    create: { id: ML_ID, ...dados },
    update: dados,
  });
}

// Troca o authorization code por tokens e salva (marca conectadoEm). true se ok.
export async function trocarCodePorToken(
  env: EnvML,
  code: string,
): Promise<boolean> {
  const t = await postToken({
    grant_type: "authorization_code",
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code,
    redirect_uri: env.redirectUri,
  });
  if (!t?.access_token) return false;
  await salvarTokens(t, true);
  return true;
}

export async function getIntegracao() {
  return prisma.integracaoMercadoLivre.findUnique({ where: { id: ML_ID } });
}

export type StatusML = {
  conectado: boolean;
  mlUserId: string | null;
  expiraEm: string | null;
  precisaReconectar: boolean;
};

export async function statusML(): Promise<StatusML> {
  const i = await getIntegracao();
  const conectado = !!i?.accessToken;
  // precisaReconectar: expirado e sem refresh token para renovar sozinho.
  const expirado = !!i?.expiraEm && i.expiraEm.getTime() < Date.now();
  const precisaReconectar = conectado && expirado && !i?.refreshToken;
  return {
    conectado,
    mlUserId: i?.mlUserId ?? null,
    expiraEm: i?.expiraEm ? i.expiraEm.toISOString() : null,
    precisaReconectar,
  };
}

// Access token valido: renova via refresh_token se faltar < 60s p/ expirar.
// Retorna null se nao conectado ou se a renovacao falhar.
export async function getAccessTokenValido(): Promise<string | null> {
  const i = await getIntegracao();
  if (!i?.accessToken) return null;

  const folga = Date.now() + 60_000;
  if (i.expiraEm && i.expiraEm.getTime() > folga) return i.accessToken;

  // Precisa renovar.
  const env = envML();
  if (!env || !i.refreshToken) {
    // Sem como renovar; token pode ainda estar valido por pouco tempo.
    return i.expiraEm && i.expiraEm.getTime() > Date.now() ? i.accessToken : null;
  }
  const t = await postToken({
    grant_type: "refresh_token",
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: i.refreshToken,
  });
  if (!t?.access_token) {
    return i.expiraEm && i.expiraEm.getTime() > Date.now() ? i.accessToken : null;
  }
  await salvarTokens(t, false);
  return t.access_token;
}

// Desconecta: zera os tokens (mantem a linha para historico simples).
export async function desconectarML(): Promise<void> {
  await prisma.integracaoMercadoLivre.upsert({
    where: { id: ML_ID },
    create: { id: ML_ID },
    update: {
      accessToken: null,
      refreshToken: null,
      expiraEm: null,
      conectadoEm: null,
    },
  });
}

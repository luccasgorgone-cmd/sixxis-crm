// Helpers para ler metadados da requisicao (sem expor nada sensivel).

export function ipDaRequisicao(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const primeiro = xff.split(",")[0]?.trim();
    if (primeiro) return primeiro;
  }
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? null;
}

export function userAgentDe(headers: Headers): string | null {
  const ua = headers.get("user-agent");
  if (!ua) return null;
  return ua.slice(0, 500);
}

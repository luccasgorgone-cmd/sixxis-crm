// Normalizacao de JID do WhatsApp para um telefone "limpo".
// Ex.: "5518999999999@s.whatsapp.net" -> "5518999999999".
// Remove o sufixo do JID e qualquer caractere que nao seja digito.
export function normalizarJid(jid: string): string {
  if (!jid) return "";
  // Descarta tudo a partir do "@" (sufixo @s.whatsapp.net, @g.us, etc.).
  const semSufixo = jid.split("@")[0] ?? "";
  // Remove qualquer caractere nao numerico (ex.: ":device" em alguns JIDs).
  return semSufixo.replace(/\D/g, "");
}

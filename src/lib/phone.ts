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

// Normaliza um telefone digitado para o MESMO formato do JID do WhatsApp
// (so digitos, com codigo do pais 55). Assim o cadastro manual casa com o lead
// que chega depois pela 1a mensagem. Numeros ja com DDI (12-13 digitos) ficam
// como estao; DDD+numero (10-11 digitos) recebem o prefixo "55".
export function normalizarTelefoneBR(entrada: string): string {
  let d = (entrada ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 11) d = `55${d}`;
  return d;
}

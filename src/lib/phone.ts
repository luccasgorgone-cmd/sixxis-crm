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

// Formas PLAUSIVEIS do MESMO numero, para busca tolerante ao 9o digito e ao DDI.
// Gera: digitos crus; com e sem o 55; e, SO para celular, com e sem o 9 apos o
// DDD. Conservador: nunca inventa numero — o 9 so entra/sai quando o comprimento
// e o padrao de celular BR batem (DDD de 2 + numero comecando em 6-9).
// Ex.: "18999998888" -> ["18999998888","1899998888","5518999998888","551899998888"]
export function variantesTelefoneBR(entrada: string): string[] {
  const d = (entrada ?? "").replace(/\D/g, "");
  if (!d) return [];

  // Parte nacional (sem o DDI 55), quando aplicavel (12-13 digitos iniciando 55).
  const nacional = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;

  const nacionais = new Set<string>([nacional]);
  // Celular COM o 9: DDD(2) + 9 + 8 digitos = 11 -> gera a versao SEM o 9.
  if (nacional.length === 11 && nacional[2] === "9") {
    nacionais.add(nacional.slice(0, 2) + nacional.slice(3));
  }
  // DDD(2) + 8 digitos = 10; se parece celular (1o digito do numero 6-9) -> COM o 9.
  if (nacional.length === 10 && /^[6-9]/.test(nacional.slice(2))) {
    nacionais.add(nacional.slice(0, 2) + "9" + nacional.slice(2));
  }

  const todas = new Set<string>([d]);
  for (const n of nacionais) {
    todas.add(n);
    if (n.length === 10 || n.length === 11) todas.add(`55${n}`);
  }
  return [...todas];
}

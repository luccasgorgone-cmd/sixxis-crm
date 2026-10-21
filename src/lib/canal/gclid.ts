// Captura do `gclid` do Google Ads embutido na 1a mensagem do WhatsApp.
//
// O Site pre-preenche o corpo do wa.me com o marcador `[#g:<gclid>]`. Diferente
// do ctwaClid do Meta (que chega no referral/externalAdReply da Evolution), o
// gclid vem DENTRO do texto — entao e preciso parsear + remover o marcador antes
// de persistir/exibir o conteudo pro atendente.
//
// v1 = SO gclid. Em iOS o Google as vezes entrega gbraid/wbraid no lugar; esses
// NAO sao cobertos aqui (v1.1 usaria marcadores proprios [#gb:]/[#wb:]). Ver
// docs/PLANO_GCLID_WHATSAPP_GOOGLE_OFFLINE.md.

// Captura o conteudo do marcador (tudo ate o `]`). A validacao de charset e
// feita DEPOIS, sobre o capturado, para um caractere inesperado nao derrubar o
// gclid inteiro em silencio nem casar parcialmente.
const RE_CAPTURA = /\[#g:([^\]]+)\]/;
// Charset valido de um gclid (base64url-ish do Google: letras, digitos, _ . -).
const RE_CHARSET = /^[A-Za-z0-9_.-]+$/;
// Remove TODAS as ocorrencias do marcador + espacos em volta (inclusive um
// marcador malformado/vazio), para o atendente nunca ver o rastro.
const RE_STRIP = /\s*\[#g:[^\]]*\]\s*/g;

export interface ResultadoGclid {
  /** gclid valido (charset ok) da 1a ocorrencia, ou null. */
  gclid: string | null;
  /** texto sem nenhum marcador [#g:...], com espacos normalizados e trim. */
  textoLimpo: string;
}

// PURO: extrai o gclid e devolve o texto sem o marcador. Nao grava lixo quando o
// conteudo do marcador falha no charset — remove o marcador, mas gclid = null.
export function extrairGclid(texto: string | null | undefined): ResultadoGclid {
  if (!texto) return { gclid: null, textoLimpo: texto == null ? "" : texto };

  const m = RE_CAPTURA.exec(texto);
  const bruto = m ? m[1] : null;
  const gclid = bruto && RE_CHARSET.test(bruto) ? bruto : null;

  // Substitui marcador+espacos por um unico espaco (evita juntar palavras), e trim.
  const textoLimpo = texto.replace(RE_STRIP, " ").trim();

  return { gclid, textoLimpo };
}

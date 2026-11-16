// Paginacao keyset (cursor) — pure. O cursor codifica o ultimo par
// (valorOrdenacao, id) da pagina, para a proxima buscar estritamente "depois".
// Determinismo: a ordenacao e sempre (campoOrdenacao ASC, id ASC), com id como
// desempate, entao o cursor e estavel mesmo com insercoes concorrentes.

export interface Cursor {
  // Valor do campo de ordenacao do ultimo item (ISO string se data, senao raw).
  o: string;
  // id do ultimo item (desempate).
  i: string;
}

export function codificarCursor(c: Cursor): string {
  const json = JSON.stringify(c);
  return Buffer.from(json, "utf8").toString("base64url");
}

// Retorna null se o cursor for invalido/corrompido (handler responde 400).
export function decodificarCursor(valor: string): Cursor | null {
  try {
    const json = Buffer.from(valor, "base64url").toString("utf8");
    const obj = JSON.parse(json) as unknown;
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as Cursor).o === "string" &&
      typeof (obj as Cursor).i === "string"
    ) {
      return { o: (obj as Cursor).o, i: (obj as Cursor).i };
    }
    return null;
  } catch {
    return null;
  }
}

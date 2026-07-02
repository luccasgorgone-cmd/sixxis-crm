// Classificacao de produto do cliente para o Mapa. Prioriza os produtos de
// interesse cadastrados (LeadProdutoInteresse); se nao houver sinal, cai para o
// titulo do anuncio de origem (Click-to-WhatsApp). E heuristica honesta por
// palavra-chave; sem sinal, retorna "Nao classificado" (nunca inventa).
import { normalizarTexto } from "./format";

export type CategoriaProduto =
  | "Climatizador"
  | "Bike Spinning"
  | "Aspirador"
  | "Nao classificado";

export const CATEGORIAS_PRODUTO: CategoriaProduto[] = [
  "Climatizador",
  "Bike Spinning",
  "Aspirador",
  "Nao classificado",
];

// Classifica um texto livre por palavra-chave. Retorna null quando nao bate em
// nenhuma categoria conhecida (deixa o chamador decidir o fallback).
function categoriaDeTexto(texto: string): CategoriaProduto | null {
  const t = normalizarTexto(texto);
  if (!t) return null;
  if (t.includes("climatiz") || t.includes("clima")) return "Climatizador";
  if (t.includes("spinning") || /\bbike\b/.test(t) || t.includes("ergometr"))
    return "Bike Spinning";
  if (t.includes("aspirador") || t.includes("aspira")) return "Aspirador";
  return null;
}

// Classifica um lead: primeiro pelos produtos de interesse, depois pelo anuncio.
export function classificarProduto(entrada: {
  interesses?: (string | null | undefined)[];
  anuncioTitulo?: string | null;
}): CategoriaProduto {
  for (const nome of entrada.interesses ?? []) {
    if (!nome) continue;
    const c = categoriaDeTexto(nome);
    if (c) return c;
  }
  const porAnuncio = entrada.anuncioTitulo
    ? categoriaDeTexto(entrada.anuncioTitulo)
    : null;
  return porAnuncio ?? "Nao classificado";
}

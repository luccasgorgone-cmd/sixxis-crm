// Classificacao de produto do cliente para o Mapa. Ordem de prioridade (do sinal
// mais forte ao mais fraco, so texto real que ja existe): produtos de interesse
// cadastrados (LeadProdutoInteresse) -> titulo do anuncio de origem
// (Click-to-WhatsApp) -> nomes das etapas dos negocios do lead -> origem. E
// heuristica honesta por palavra-chave; sem sinal, retorna "Nao classificado"
// (nunca inventa).
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

// Classifica um lead percorrendo as fontes na ordem de prioridade: produtos de
// interesse -> anuncio -> nomes das etapas dos negocios -> origem. Retorna a
// primeira categoria que baterem; sem sinal em nenhuma, "Nao classificado".
export function classificarProduto(entrada: {
  interesses?: (string | null | undefined)[];
  anuncioTitulo?: string | null;
  etapasNomes?: (string | null | undefined)[];
  origem?: string | null;
}): CategoriaProduto {
  // Fontes em ordem: cada uma e uma lista de textos livres a testar.
  const fontes: (string | null | undefined)[][] = [
    entrada.interesses ?? [],
    [entrada.anuncioTitulo],
    entrada.etapasNomes ?? [],
    [entrada.origem],
  ];
  for (const fonte of fontes) {
    for (const texto of fonte) {
      if (!texto) continue;
      const c = categoriaDeTexto(texto);
      if (c) return c;
    }
  }
  return "Nao classificado";
}

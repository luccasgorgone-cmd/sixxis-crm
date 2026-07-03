// Helpers dos PARCEIROS (tecnicos). Reusa lib/ddd para inferir UF/regiao do
// telefone (com override manual). Sem tocar em Lead/Negocio/metricas.
import { ufPorTelefone, infoPorUF } from "./ddd";
import { Papel } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";

// Categorias de produto REAIS da loja que um parceiro pode atender. Fonte unica
// (usada na validacao dos endpoints e na UI de cadastro/filtro).
export const CATEGORIAS_PARCEIRO = [
  { id: "climatizadores", rotulo: "Climatizadores" },
  { id: "aspiradores", rotulo: "Aspiradores" },
  { id: "spinning", rotulo: "Spinning" },
] as const;

const IDS_CATEGORIA = new Set<string>(CATEGORIAS_PARCEIRO.map((c) => c.id));

// Normaliza uma lista de categorias recebida: so ids validos, sem repetir.
export function parseCategorias(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const validas = v.filter(
    (x): x is string => typeof x === "string" && IDS_CATEGORIA.has(x),
  );
  return Array.from(new Set(validas));
}

// WhereInput a partir dos filtros da querystring (lista e agregacao por estado).
export function filtrosParceiro(sp: URLSearchParams): Prisma.ParceiroWhereInput {
  const where: Prisma.ParceiroWhereInput = {};
  const q = sp.get("q")?.trim();
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { cidade: { contains: q, mode: "insensitive" } },
    ];
  }
  const uf = sp.get("uf");
  if (uf) where.uf = uf.toUpperCase();
  const regiao = sp.get("regiao");
  if (regiao) where.regiao = regiao;
  const esp = sp.get("especialidade");
  if (esp) where.especialidade = { contains: esp, mode: "insensitive" };
  const categoria = sp.get("categoria");
  if (categoria && IDS_CATEGORIA.has(categoria)) {
    // Parceiros cuja lista JSON de categorias contem a categoria pedida.
    where.categorias = { array_contains: categoria };
  }
  const ativo = sp.get("ativo");
  if (ativo === "1") where.ativo = true;
  else if (ativo === "0") where.ativo = false;
  return where;
}

// Quem gerencia parceiros: ADMIN e POS_VENDA (ferramenta de pos-venda). Os demais
// papeis logados so LEEM (GET). Ver os endpoints.
export function podeGerenciarParceiros(papel: Papel): boolean {
  return papel === Papel.ADMIN || papel === Papel.POS_VENDA;
}

// Resolve uf/regiao: prioriza a UF manual; na falta, infere do telefone (DDD). A
// regiao sempre deriva da UF final (fonte unica, lib/ddd).
export function resolverLocal(input: {
  telefone?: string | null;
  uf?: string | null;
}): { uf: string | null; regiao: string | null } {
  const manual = (input.uf ?? "").trim().toUpperCase();
  let uf: string | null = manual || null;
  if (!uf && input.telefone) uf = ufPorTelefone(input.telefone);
  const regiao = uf ? (infoPorUF(uf)?.regiao ?? null) : null;
  return { uf, regiao };
}

// Valor de frete (>= 0) a partir de valor desconhecido; null para vazio/invalido.
export function parseFrete(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Texto aparado ou null (para campos opcionais).
export function textoOuNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

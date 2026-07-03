// Helpers dos PARCEIROS (tecnicos). Reusa lib/ddd para inferir UF/regiao do
// telefone (com override manual). Sem tocar em Lead/Negocio/metricas.
import { ufPorTelefone, infoPorUF } from "./ddd";
import { Papel } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";

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

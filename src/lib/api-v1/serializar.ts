// Serializador = FRONTEIRA ANTI-VAZAMENTO. Dois papeis:
//  1) selecaoPrisma: monta o `select` do Prisma SO com colunas da allowlist do
//     recurso. Nada fora de recurso.campos chega ao banco (deny-by-default).
//  2) serializarItem: converte a linha em JSON aplicando tipo de campo
//     (dinheiro->string, data->ISO), mascara de PII (sem read:pii) e gate de
//     conteudo de mensagem (sem read:mensagens).
//
// Qualquer campo novo so aparece na API se for adicionado explicitamente a
// allowlist — por isso segredos (tokens/senha/raw) nunca vazam por descuido.

import type { DescricaoCampo, Recurso } from "./tipos";
import { mascarar } from "./mascara";

export interface ContextoSerializacao {
  podePii: boolean;
  podeMensagens: boolean;
  // Campos esparsos pedidos (fields=...). undefined => todos da allowlist.
  fields?: string[];
  // Expansoes pedidas e ja resolvidas: nomeExpand -> recurso relacionado.
  expand?: Record<string, Recurso>;
}

// Colunas escalares a selecionar no Prisma (allowlist [∩ fields] + id + watermark).
export function colunasSelecionadas(recurso: Recurso, fields?: string[]): string[] {
  const todas = Object.keys(recurso.campos);
  const base = fields ? todas.filter((c) => fields.includes(c)) : todas.slice();
  const obrigatorias = new Set<string>(base);
  obrigatorias.add("id");
  obrigatorias.add(recurso.campoOrdenacao ?? "criadoEm");
  if (recurso.campoAtualizacao) obrigatorias.add(recurso.campoAtualizacao);
  return [...obrigatorias];
}

// Monta o objeto `select` do Prisma (inclui expand profundidade 1).
export function selecaoPrisma(recurso: Recurso, ctx?: Pick<ContextoSerializacao, "fields" | "expand">): Record<string, unknown> {
  const select: Record<string, unknown> = {};
  for (const col of colunasSelecionadas(recurso, ctx?.fields)) select[col] = true;
  if (ctx?.expand) {
    for (const [nome, relacionado] of Object.entries(ctx.expand)) {
      const def = recurso.expand?.[nome];
      if (!def) continue;
      // Profundidade 1: sem expand aninhado.
      select[def.relacao] = { select: selecaoPrisma(relacionado) };
    }
  }
  return select;
}

function serializarValor(valor: unknown, campo: DescricaoCampo, ctx: ContextoSerializacao): unknown {
  if (valor === null || valor === undefined) return null;
  switch (campo.tipo) {
    case "data":
      return valor instanceof Date ? valor.toISOString() : String(valor);
    case "dinheiro":
      return paraDecimalString(valor);
    case "pii":
      if (ctx.podePii) return valor;
      return mascarar(valor, campo.pii ?? "nome");
    case "mensagem":
      if (ctx.podeMensagens) return valor;
      return null;
    case "texto":
    default:
      return valor;
  }
}

// Decimal (Prisma Decimal.js) / number -> string com 2 casas. Nunca float.
export function paraDecimalString(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  // Prisma Decimal e Decimal.js expoem toFixed.
  const comToFixed = valor as { toFixed?: (n: number) => string };
  if (typeof comToFixed.toFixed === "function") {
    try {
      return comToFixed.toFixed(2);
    } catch {
      /* cai pro String abaixo */
    }
  }
  const n = Number(valor);
  if (Number.isFinite(n)) return n.toFixed(2);
  return String(valor);
}

export function serializarItem(recurso: Recurso, row: Record<string, unknown>, ctx: ContextoSerializacao): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const campos = recurso.campos;
  const nomes = ctx.fields ? Object.keys(campos).filter((c) => ctx.fields!.includes(c)) : Object.keys(campos);
  // id sempre presente (identidade), mesmo com fields esparsos.
  if (!nomes.includes("id") && campos.id) out.id = row.id ?? null;
  for (const nome of nomes) {
    out[nome] = serializarValor(row[nome], campos[nome], ctx);
  }
  // Expansoes (profundidade 1).
  if (ctx.expand) {
    for (const [nome, relacionado] of Object.entries(ctx.expand)) {
      const def = recurso.expand?.[nome];
      if (!def) continue;
      const rel = row[def.relacao];
      if (rel === null || rel === undefined) {
        out[nome] = null;
      } else if (Array.isArray(rel)) {
        out[nome] = rel.map((r) => serializarItem(relacionado, r as Record<string, unknown>, { podePii: ctx.podePii, podeMensagens: ctx.podeMensagens }));
      } else {
        out[nome] = serializarItem(relacionado, rel as Record<string, unknown>, { podePii: ctx.podePii, podeMensagens: ctx.podeMensagens });
      }
    }
  }
  return out;
}

// Traducao de parametros de URL -> argumentos Prisma (where/orderBy/take/cursor)
// de forma segura e determinista. Toda entrada e validada; entrada invalida vira
// ProblemaApi (400). Nenhuma coluna fora da allowlist/filtros do recurso e usada.

import type { Recurso } from "./tipos";
import { decodificarCursor, type Cursor } from "./cursor";
import { requisicaoInvalida } from "./erros";
import { recursoPorNome } from "./registro";

export const LIMITE_PADRAO = 100;
export const LIMITE_MAX = 500;
// Teto de itens no filtro 'ids' (evita WHERE id IN (...) gigante -> carga no Postgres).
export const MAX_IDS = 500;

export interface PlanoConsulta {
  // Argumentos para prisma.<model>.findMany (sem `select`, que vem do serializador).
  where: Record<string, unknown>;
  orderBy: Array<Record<string, "asc" | "desc">>;
  take: number; // limite + 1 (para detectar hasMore)
  limite: number; // limite efetivo pedido
  // Campos esparsos validados (undefined => todos da allowlist).
  fields?: string[];
  // Expansoes resolvidas: nomeExpand -> recurso relacionado.
  expand?: Record<string, Recurso>;
  // Coluna de ordenacao efetiva (para montar o proximo cursor).
  colunaOrdenacao: string;
}

function lerInt(params: URLSearchParams, nome: string): number | undefined {
  const bruto = params.get(nome);
  if (bruto === null || bruto === "") return undefined;
  if (!/^-?\d+$/.test(bruto)) throw requisicaoInvalida(`Parametro '${nome}' deve ser inteiro.`);
  return Number(bruto);
}

function lerData(params: URLSearchParams, nome: string): Date | undefined {
  const bruto = params.get(nome);
  if (!bruto) return undefined;
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) throw requisicaoInvalida(`Parametro '${nome}' deve ser data ISO 8601.`);
  return d;
}

function lerBool(params: URLSearchParams, nome: string): boolean | undefined {
  const bruto = params.get(nome);
  if (bruto === null) return undefined;
  if (bruto === "true" || bruto === "1") return true;
  if (bruto === "false" || bruto === "0") return false;
  throw requisicaoInvalida(`Parametro '${nome}' deve ser true/false.`);
}

function lerLista(params: URLSearchParams, nome: string): string[] | undefined {
  const bruto = params.get(nome);
  if (!bruto) return undefined;
  const itens = bruto.split(",").map((s) => s.trim()).filter(Boolean);
  return itens.length ? itens : undefined;
}

// Fields esparsos + expand (profundidade 1), validados contra a allowlist.
// Reusado por lista e item. Entrada invalida -> ProblemaApi (400).
export function montarSelecao(recurso: Recurso, params: URLSearchParams): {
  fields?: string[];
  expand?: Record<string, Recurso>;
} {
  let fields: string[] | undefined;
  const fieldsBruto = lerLista(params, "fields");
  if (fieldsBruto) {
    for (const f of fieldsBruto) {
      if (!recurso.campos[f]) throw requisicaoInvalida(`Campo desconhecido em 'fields': '${f}'.`);
    }
    fields = fieldsBruto;
  }
  let expand: Record<string, Recurso> | undefined;
  const expandBruto = lerLista(params, "expand");
  if (expandBruto) {
    expand = {};
    for (const nome of expandBruto) {
      const def = recurso.expand?.[nome];
      if (!def) throw requisicaoInvalida(`Expansao desconhecida: '${nome}'.`);
      const relacionado = recursoPorNome(def.recurso);
      if (!relacionado) throw requisicaoInvalida(`Expansao '${nome}' aponta para recurso inexistente.`);
      expand[nome] = relacionado;
    }
  }
  return { fields, expand };
}

// Converte o valor do cursor (string) para o tipo correto da coluna de ordenacao.
function coerceOrdenacao(recurso: Recurso, coluna: string, valor: string): unknown {
  const campo = recurso.campos[coluna];
  if (campo?.tipo === "data") {
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) throw requisicaoInvalida("Cursor invalido.");
    return d;
  }
  // Coluna numerica (ex.: ordem) -> number; caso contrario string (ex.: id/cuid).
  if (/^-?\d+$/.test(valor)) return Number(valor);
  return valor;
}

export function montarPlano(recurso: Recurso, params: URLSearchParams): PlanoConsulta {
  const condicoes: Array<Record<string, unknown>> = [];
  const colunaOrdenacao = recurso.campoOrdenacao ?? "criadoEm";

  // --- limite ---------------------------------------------------------------
  const limiteBruto = lerInt(params, "limit");
  const limite = limiteBruto ?? LIMITE_PADRAO;
  // Contrato publico: 1..500 (bate com o 'maximum' do OpenAPI). Fora da faixa e
  // 400 explicito — nunca clamp silencioso (o consumidor saberia errado quantas
  // linhas pediu).
  if (limite < 1 || limite > LIMITE_MAX) {
    throw requisicaoInvalida(`'limit' deve ser entre 1 e ${LIMITE_MAX}.`);
  }

  // --- cursor (keyset) ------------------------------------------------------
  let cursor: Cursor | null = null;
  const cursorBruto = params.get("cursor");
  if (cursorBruto) {
    cursor = decodificarCursor(cursorBruto);
    if (!cursor) throw requisicaoInvalida("Cursor invalido ou corrompido.");
  }

  // --- filtro ids -----------------------------------------------------------
  const ids = lerLista(params, "ids");
  if (ids) {
    if (ids.length > MAX_IDS) {
      throw requisicaoInvalida(`Parametro 'ids' aceita no maximo ${MAX_IDS} valores (recebidos ${ids.length}).`);
    }
    condicoes.push({ id: { in: ids } });
  }

  // --- janelas de data ------------------------------------------------------
  // So aplicamos janelas de data quando a coluna mapeada e realmente temporal.
  // Recursos ordenados por "id" (sem coluna de data) nao suportam esses filtros;
  // aplica-los geraria comparacao String x DateTime no Prisma (erro 500).
  const colCriacao = recurso.campoCriacao ?? colunaOrdenacao;
  const colAtualizacao = recurso.campoAtualizacao ?? colunaOrdenacao;
  const suportaCriacao = colCriacao !== "id";
  const suportaAtualizacao = colAtualizacao !== "id";
  const criadoDesde = lerData(params, "criadoDesde");
  const criadoAte = lerData(params, "criadoAte");
  const atualizadoDesde = lerData(params, "atualizadoDesde");
  const atualizadoAte = lerData(params, "atualizadoAte");
  if (criadoDesde || criadoAte) {
    if (!suportaCriacao) {
      throw requisicaoInvalida(
        `Recurso '${recurso.nome}' nao suporta filtro por data de criacao (criadoDesde/criadoAte); use 'cursor' ou 'ids'.`,
      );
    }
    condicoes.push({ [colCriacao]: { ...(criadoDesde ? { gte: criadoDesde } : {}), ...(criadoAte ? { lte: criadoAte } : {}) } });
  }
  if (atualizadoDesde || atualizadoAte) {
    if (!suportaAtualizacao) {
      throw requisicaoInvalida(
        `Recurso '${recurso.nome}' nao suporta filtro por data de atualizacao (atualizadoDesde/atualizadoAte); use 'cursor' ou 'ids'.`,
      );
    }
    condicoes.push({ [colAtualizacao]: { ...(atualizadoDesde ? { gte: atualizadoDesde } : {}), ...(atualizadoAte ? { lte: atualizadoAte } : {}) } });
  }

  // --- primeira pagina de tabela grande ------------------------------------
  // Tabelas grandes NAO exigem mais um filtro para a 1a pagina. A consulta e
  // sempre keyset (orderBy em coluna indexada + take = limite+1, limite <= 500):
  // mesmo sem cursor/ids/data o Postgres le no maximo 501 linhas — nunca uma
  // varredura completa. A carga inicial fica trivial (so `?limit=N`) e as
  // paginas seguintes seguem por meta.nextCursor. Filtros de data continuam
  // disponiveis para carga incremental em recursos com coluna temporal.

  // --- soft delete ----------------------------------------------------------
  const incluirExcluidos = lerBool(params, "incluirExcluidos") ?? false;
  if (recurso.softDelete && !incluirExcluidos) {
    condicoes.push({ [recurso.softDelete]: false });
  }

  // --- filtros naturais (igualdade exata) -----------------------------------
  if (recurso.filtros) {
    for (const [param, coluna] of Object.entries(recurso.filtros)) {
      const valor = params.get(param);
      if (valor === null || valor === "") continue;
      // Booleans e enums chegam como string; Prisma coage enum/string; para bool
      // explicito convertemos.
      if (valor === "true" || valor === "false") {
        condicoes.push({ [coluna]: valor === "true" });
      } else {
        condicoes.push({ [coluna]: valor });
      }
    }
  }
  // Filtro 'status' generico (coluna 'status'), se o recurso a possui e nao a
  // declarou em filtros.
  if (!recurso.filtros?.status && recurso.campos.status) {
    const status = params.get("status");
    if (status) condicoes.push({ status });
  }

  // --- busca textual q (ILIKE contains) -------------------------------------
  const q = params.get("q");
  if (q && recurso.busca && recurso.busca.length) {
    condicoes.push({
      OR: recurso.busca.map((col) => ({ [col]: { contains: q, mode: "insensitive" } })),
    });
  } else if (q && (!recurso.busca || !recurso.busca.length)) {
    throw requisicaoInvalida(`Recurso '${recurso.nome}' nao suporta busca textual 'q'.`);
  }

  // --- cursor keyset: (ord > o) OU (ord = o E id > i) -----------------------
  if (cursor) {
    const ordVal = coerceOrdenacao(recurso, colunaOrdenacao, cursor.o);
    if (colunaOrdenacao === "id") {
      condicoes.push({ id: { gt: cursor.i } });
    } else {
      condicoes.push({
        OR: [
          { [colunaOrdenacao]: { gt: ordVal } },
          { AND: [{ [colunaOrdenacao]: ordVal }, { id: { gt: cursor.i } }] },
        ],
      });
    }
  }

  // --- fields esparsos + expand (profundidade 1) ----------------------------
  const { fields, expand } = montarSelecao(recurso, params);

  // --- orderBy determinista -------------------------------------------------
  const orderBy: Array<Record<string, "asc" | "desc">> =
    colunaOrdenacao === "id" ? [{ id: "asc" }] : [{ [colunaOrdenacao]: "asc" }, { id: "asc" }];

  const where = condicoes.length ? { AND: condicoes } : {};

  return { where, orderBy, take: limite + 1, limite, fields, expand, colunaOrdenacao };
}

// Constroi o cursor da proxima pagina a partir da ultima linha retornada.
export function proximoCursor(recurso: Recurso, ultima: Record<string, unknown>, colunaOrdenacao: string): string | null {
  const valorOrd = ultima[colunaOrdenacao];
  const id = ultima.id;
  if (id === undefined || id === null) return null;
  const o = valorOrd instanceof Date ? valorOrd.toISOString() : String(valorOrd ?? "");
  const cursor: Cursor = { o, i: String(id) };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

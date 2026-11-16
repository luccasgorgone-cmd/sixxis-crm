// Gerador do documento OpenAPI 3.1 da API de Leitura v1, a partir do registro.
// Fonte unica de verdade = RECURSOS: o contrato publicado nunca descreve um
// campo que o serializador nao exporia (mesma allowlist).
//
// Servido por GET /api/v1/openapi.json e renderizado por GET /api/v1/docs.

import { listarRecursos, temCampoMensagem } from "./registro";
import type { DescricaoCampo, Recurso } from "./tipos";
import { API_VERSION } from "./tipos";
import { ESCOPO_TUDO, ESCOPO_PII, ESCOPO_MENSAGENS, ESCOPOS_DOMINIO } from "./escopos";

type Json = Record<string, unknown>;

// DescricaoCampo -> JSON Schema (3.1). Tudo nullable (colunas podem ser null).
function schemaCampo(campo: DescricaoCampo): Json {
  const base: Json = { description: campo.descricao };
  if (campo.enum && campo.enum.length) {
    return { ...base, type: ["string", "null"], enum: [...campo.enum, null] };
  }
  switch (campo.tipo) {
    case "data":
      return { ...base, type: ["string", "null"], format: "date-time", description: campo.descricao ?? "ISO 8601 UTC." };
    case "dinheiro":
      return {
        ...base,
        type: ["string", "null"],
        example: "1234.50",
        description: campo.descricao ?? "Decimal BRL em string, 2 casas. Nunca float.",
      };
    case "pii":
      return {
        ...base,
        type: ["string", "null"],
        description: `${campo.descricao ?? "Dado pessoal"} (mascarado sem escopo read:pii).`,
      };
    case "mensagem":
      return {
        ...base,
        type: ["string", "null"],
        description: `${campo.descricao ?? "Conteudo de mensagem"} (null sem escopo read:mensagens).`,
      };
    case "texto":
    default:
      // Pode ser string, number, boolean, array ou objeto (Json). Deixamos livre.
      return { ...base };
  }
}

function schemaRecurso(recurso: Recurso): Json {
  const props: Json = {};
  for (const [nome, campo] of Object.entries(recurso.campos)) {
    props[nome] = schemaCampo(campo);
  }
  // Expansoes aparecem como $ref opcionais (profundidade 1).
  if (recurso.expand) {
    for (const [nome, def] of Object.entries(recurso.expand)) {
      props[nome] = {
        description: `Expansao (expand=${nome}): ${def.recurso}.`,
        oneOf: [{ $ref: `#/components/schemas/${nomeSchema(def.recurso)}` }, { type: "null" }],
      };
    }
  }
  return {
    type: "object",
    description: recurso.descricao,
    properties: props,
    additionalProperties: false,
  };
}

function nomeSchema(nomeRecurso: string): string {
  // kebab -> PascalCase (produtos-interesse -> ProdutosInteresse).
  return nomeRecurso
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function escoposDoRecurso(recurso: Recurso): string[] {
  const e = [recurso.escopo];
  if (recurso.campos && Object.values(recurso.campos).some((c) => c.tipo === "pii")) e.push(ESCOPO_PII);
  if (temCampoMensagem(recurso)) e.push(ESCOPO_MENSAGENS);
  return e;
}

const PARAMS_LISTA_COMUNS = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 }, description: "Tamanho da pagina." },
  { name: "cursor", in: "query", schema: { type: "string" }, description: "Cursor keyset opaco (meta.nextCursor da pagina anterior)." },
  { name: "ids", in: "query", schema: { type: "string" }, description: "Lista de ids separada por virgula." },
  { name: "criadoDesde", in: "query", schema: { type: "string", format: "date-time" } },
  { name: "criadoAte", in: "query", schema: { type: "string", format: "date-time" } },
  { name: "atualizadoDesde", in: "query", schema: { type: "string", format: "date-time" }, description: "Sync incremental: so registros alterados desde esta data." },
  { name: "atualizadoAte", in: "query", schema: { type: "string", format: "date-time" } },
  { name: "fields", in: "query", schema: { type: "string" }, description: "Campos esparsos separados por virgula." },
  { name: "expand", in: "query", schema: { type: "string" }, description: "Expansoes (profundidade 1) separadas por virgula." },
  { name: "incluirExcluidos", in: "query", schema: { type: "boolean", default: false }, description: "Inclui registros com soft-delete." },
  { name: "q", in: "query", schema: { type: "string" }, description: "Busca textual livre (quando o recurso suporta)." },
];

function pathsDoRecurso(recurso: Recurso): Json {
  const ref = `#/components/schemas/${nomeSchema(recurso.nome)}`;
  const tag = recurso.escopo.replace("read:", "");
  const envelopeLista: Json = {
    type: "object",
    properties: {
      data: { type: "array", items: { $ref: ref } },
      meta: { $ref: "#/components/schemas/MetaLista" },
    },
    required: ["data", "meta"],
  };
  const envelopeItem: Json = {
    type: "object",
    properties: { data: { $ref: ref }, meta: { $ref: "#/components/schemas/MetaItem" } },
    required: ["data", "meta"],
  };
  const paramsNaturais = recurso.filtros
    ? Object.keys(recurso.filtros).map((p) => ({ name: p, in: "query", schema: { type: "string" } }))
    : [];
  const statusParam = [{ name: "status", in: "query", schema: { type: "string" }, description: "Filtro de status (quando aplicavel)." }];

  return {
    [`/${recurso.nome}`]: {
      get: {
        tags: [tag],
        summary: `Lista ${recurso.nome}`,
        description: recurso.descricao,
        security: [{ bearerAuth: escoposDoRecurso(recurso) }],
        parameters: [...PARAMS_LISTA_COMUNS, ...statusParam, ...paramsNaturais],
        responses: respostasPadrao(envelopeLista),
      },
    },
    [`/${recurso.nome}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Obtem um ${recurso.nome} por id`,
        security: [{ bearerAuth: escoposDoRecurso(recurso) }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "fields", in: "query", schema: { type: "string" } },
          { name: "expand", in: "query", schema: { type: "string" } },
          { name: "incluirExcluidos", in: "query", schema: { type: "boolean", default: false } },
        ],
        responses: respostasPadrao(envelopeItem, true),
      },
    },
  };
}

function respostasPadrao(schema200: Json, com_404 = false): Json {
  const r: Json = {
    "200": {
      description: "OK",
      headers: cabecalhosPadrao(),
      content: { "application/json": { schema: schema200 } },
    },
    "400": refProblema("Requisicao invalida (parametros)."),
    "401": refProblema("Nao autenticado (Bearer ausente/invalido/revogado)."),
    "403": refProblema("Escopo insuficiente."),
    "429": refProblema("Rate limit excedido (600 req/min por chave)."),
    "500": refProblema("Erro interno."),
  };
  if (com_404) r["404"] = refProblema("Recurso nao encontrado.");
  return r;
}

function cabecalhosPadrao(): Json {
  return {
    "X-Request-Id": { schema: { type: "string" }, description: "Id de correlacao da requisicao." },
    "X-RateLimit-Limit": { schema: { type: "integer" } },
    "X-RateLimit-Remaining": { schema: { type: "integer" } },
    "X-RateLimit-Reset": { schema: { type: "integer" }, description: "Segundos ate reiniciar a janela." },
  };
}

function refProblema(description: string): Json {
  return {
    description,
    content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problema" } } },
  };
}

export interface InfoBuild {
  commit: string;
  time: string;
}

export function gerarOpenApi(build: InfoBuild): Json {
  const recursos = listarRecursos();
  const paths: Json = {};

  // Transversais.
  paths["/health"] = {
    get: {
      tags: ["meta"],
      summary: "Health check (sem auth)",
      security: [],
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "ok" },
                  version: { type: "string" },
                  commit: { type: "string" },
                  time: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
      },
    },
  };
  paths["/me"] = {
    get: {
      tags: ["meta"],
      summary: "Informacoes da chave atual",
      security: [{ bearerAuth: [] }],
      responses: respostasPadrao({ $ref: "#/components/schemas/Me" }),
    },
  };
  paths["/meta/recursos"] = {
    get: {
      tags: ["meta"],
      summary: "Catalogo de recursos e escopos",
      security: [{ bearerAuth: [] }],
      responses: respostasPadrao({ type: "object" }),
    },
  };
  paths["/openapi.json"] = {
    get: { tags: ["meta"], summary: "Este documento OpenAPI 3.1", security: [], responses: { "200": { description: "OK" } } },
  };
  paths["/docs"] = {
    get: { tags: ["meta"], summary: "Documentacao interativa (Scalar)", security: [], responses: { "200": { description: "HTML" } } },
  };

  // Recursos de dados.
  const schemas: Json = {
    MetaLista: {
      type: "object",
      properties: {
        requestId: { type: "string" },
        count: { type: "integer" },
        hasMore: { type: "boolean" },
        nextCursor: { type: ["string", "null"] },
        generatedAt: { type: "string", format: "date-time" },
        apiVersion: { type: "string" },
      },
    },
    MetaItem: {
      type: "object",
      properties: {
        requestId: { type: "string" },
        generatedAt: { type: "string", format: "date-time" },
        apiVersion: { type: "string" },
      },
    },
    Problema: {
      type: "object",
      description: "Erro no formato RFC 9457.",
      properties: {
        type: { type: "string" },
        title: { type: "string" },
        status: { type: "integer" },
        detail: { type: "string" },
        instance: { type: "string" },
        requestId: { type: "string" },
      },
      required: ["type", "title", "status"],
    },
    Me: {
      type: "object",
      properties: {
        nome: { type: "string" },
        prefixo: { type: "string" },
        escopos: { type: "array", items: { type: "string" } },
        expiraEm: { type: ["string", "null"], format: "date-time" },
      },
    },
  };

  for (const recurso of recursos) {
    Object.assign(paths, pathsDoRecurso(recurso));
    schemas[nomeSchema(recurso.nome)] = schemaRecurso(recurso);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Sixxis CRM — API de Leitura v1",
      version: API_VERSION,
      description:
        "API REST read-only do CRM. Autenticacao Bearer (sxc_live_...). " +
        "Somente GET/HEAD/OPTIONS. Datas ISO 8601 UTC; dinheiro em string decimal BRL. " +
        "Paginacao por cursor keyset. Erros em application/problem+json (RFC 9457).",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }],
    "x-build": build,
    tags: [{ name: "meta" }, ...ESCOPOS_DOMINIO.map((e) => ({ name: e.replace("read:", "") }))],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Chave de leitura 'sxc_live_...'. Escopos: read:all (todos os recursos), " +
            "granular read:<dominio>, read:pii (PII sem mascara), read:mensagens (conteudo de conversa).",
        },
      },
      schemas,
    },
    "x-escopos": {
      [ESCOPO_TUDO]: "Le todos os recursos de dominio (nao concede pii/mensagens).",
      [ESCOPO_PII]: "Libera telefone/email/documento/endereco sem mascara.",
      [ESCOPO_MENSAGENS]: "Libera conteudo de mensagens/conversas.",
      ...Object.fromEntries(ESCOPOS_DOMINIO.map((e) => [e, `Le recursos do dominio ${e.replace("read:", "")}.`])),
    },
    paths,
  };
}

// HTML minimo que carrega o Scalar API Reference apontando para /openapi.json.
export function htmlDocs(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sixxis CRM — API de Leitura v1</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/v1/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

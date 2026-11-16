// Tipos compartilhados da API de Leitura v1 (read-only externa).
// Mantido sem dependencias de runtime para poder ser importado por contratos.

export const API_VERSION = "v1" as const;

// Como um campo deve ser serializado na saida JSON.
//  - "texto"    : string/number/bool/arrays simples, copiado como esta
//  - "data"     : Date -> ISO 8601 UTC (string) ou null
//  - "dinheiro"  : Decimal/number -> string decimal com 2 casas (BRL) ou null
//  - "pii"      : string sensivel; mascarada se a chave nao tem read:pii
//  - "mensagem" : conteudo de mensagem; exige escopo read:mensagens
export type TipoCampo = "texto" | "data" | "dinheiro" | "pii" | "mensagem";

// Estrategia de mascara aplicada a um campo "pii" quando falta read:pii.
export type EstiloPii = "telefone" | "email" | "documento" | "endereco" | "nome";

export interface DescricaoCampo {
  // Como serializar o valor.
  tipo: TipoCampo;
  // Para tipo "pii": estilo de mascara.
  pii?: EstiloPii;
  // Documentacao curta do campo (vai pro dicionario de dados / OpenAPI).
  descricao?: string;
  // Enum documentado (lista de valores possiveis), quando aplicavel.
  enum?: readonly string[];
}

// Um recurso exposto: mapeia 1:1 para um model Prisma, com allowlist de campos.
// O conjunto de chaves de `campos` E a fronteira de seguranca anti-vazamento:
// nada fora dela chega ao Prisma select nem ao JSON.
export interface Recurso {
  // Nome na rota: /api/v1/<nome>.
  nome: string;
  // Nome do model no Prisma Client (ex.: "lead", "negocio").
  model: string;
  // Escopo granular exigido (alem de read:all) para ler este recurso.
  escopo: string;
  // Allowlist de campos -> como serializar. SO estes campos existem para a API.
  campos: Record<string, DescricaoCampo>;
  // Campo de ordenacao/sync incremental (watermark). Default: "criadoEm".
  campoOrdenacao?: string;
  // Campo usado pelo filtro atualizadoDesde/atualizadoAte. Se ausente, cai no
  // campoOrdenacao. Quando o model nao tem watermark de update, documentamos.
  campoAtualizacao?: string;
  // Campos de data aceitos em criadoDesde/criadoAte (default "criadoEm").
  campoCriacao?: string;
  // Filtros naturais permitidos: nomeParam -> coluna Prisma (igualdade exata).
  // So colunas escalares seguras (ids/enums/flags), nunca PII em filtro.
  filtros?: Record<string, string>;
  // Colunas de texto varridas pelo parametro `q` (ILIKE contains).
  busca?: readonly string[];
  // Flag de soft-delete (boolean) que, por padrao, e filtrada para false.
  // Ex.: "arquivado". Com incluirExcluidos=true, nao filtra.
  softDelete?: string;
  // Expansoes permitidas (profundidade 1): nomeExpand -> { relacao, recurso }.
  expand?: Record<string, { relacao: string; recurso: string }>;
  // Descricao do recurso (catalogo / OpenAPI).
  descricao?: string;
  // true => tabela grande: exige janela de data ou cursor, cap de profundidade.
  grande?: boolean;
}

export interface MetaLista {
  requestId: string;
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  generatedAt: string;
  apiVersion: string;
}

export interface MetaItem {
  requestId: string;
  generatedAt: string;
  apiVersion: string;
}

export interface ChaveAutenticada {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  expiraEm: Date | null;
}

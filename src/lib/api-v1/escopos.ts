// Escopos da API de Leitura v1. Pure (sem runtime) para ser testavel em contrato.
//
// Regras:
//  - "read:all" concede leitura de TODOS os recursos de dominio. NAO concede
//    por si so read:pii nem read:mensagens (precisam ser explicitos) — assim a
//    exposicao de dados pessoais / conteudo de conversa e sempre deliberada.
//  - Escopo granular por recurso: "read:<dominio>" (ex.: read:pedidos).
//  - "read:pii" libera valores sensiveis sem mascara (telefone/email/CPF/...).
//  - "read:mensagens" libera conteudo de mensagens/conversa.

export const ESCOPO_TUDO = "read:all";
export const ESCOPO_PII = "read:pii";
export const ESCOPO_MENSAGENS = "read:mensagens";

// Escopos granulares de dominio conhecidos (documentados no catalogo/OpenAPI).
export const ESCOPOS_DOMINIO = [
  "read:clientes",
  "read:pedidos",
  "read:negocios",
  "read:conversas",
  "read:mensagens",
  "read:agentes",
  "read:produtos",
  "read:pagamentos",
  "read:campanhas",
  "read:tarefas",
  "read:metas",
  "read:analytics",
  "read:catalogo",
  "read:integracoes",
  "read:config",
  "read:supervisor",
  "read:oracle",
] as const;

export const ESCOPOS_ESPECIAIS = [ESCOPO_TUDO, ESCOPO_PII, ESCOPO_MENSAGENS] as const;

export const TODOS_ESCOPOS = [
  ESCOPO_TUDO,
  ESCOPO_PII,
  ...ESCOPOS_DOMINIO,
] as const;

// A chave pode ler um recurso cujo escopo exigido e `escopoRecurso`?
export function podeLerRecurso(escoposChave: readonly string[], escopoRecurso: string): boolean {
  if (escoposChave.includes(ESCOPO_TUDO)) return true;
  return escoposChave.includes(escopoRecurso);
}

// A chave pode ver PII sem mascara?
export function podeVerPii(escoposChave: readonly string[]): boolean {
  return escoposChave.includes(ESCOPO_PII);
}

// A chave pode ver conteudo de mensagens?
export function podeVerMensagens(escoposChave: readonly string[]): boolean {
  return escoposChave.includes(ESCOPO_MENSAGENS);
}

// Valida uma lista de escopos pedida na criacao de chave (CLI). Retorna os
// desconhecidos (para avisar), mas nao bloqueia — permite escopos futuros.
export function escoposDesconhecidos(escopos: readonly string[]): string[] {
  const conhecidos = new Set<string>([...TODOS_ESCOPOS]);
  return escopos.filter((e) => !conhecidos.has(e));
}

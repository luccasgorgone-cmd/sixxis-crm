// Motor de variaveis dos Modelos de mensagem. Compartilhado entre servidor
// (campanhas/seeds) e cliente (admin/inbox). Sem dependencias de Prisma aqui.
//
// AUTOMATICAS: resolvidas do lead/contexto -> {nome} {primeiro_nome} {empresa}
//              {loja} {link}.
// DIGITADAS: o usuario preenche na hora -> {cupom} {desconto} {validade} {data}.

export type LeadModelo = {
  nomeEfetivo: string;
  empresa?: string | null;
};

export const LOJA_NOME = "Sixxis";

// URL publica da loja (configuravel). Default amigavel.
export function linkLoja(): string {
  return (
    process.env.NEXT_PUBLIC_LOJA_URL ??
    process.env.LOJA_URL ??
    "https://sixxis.com.br"
  );
}

export const VARIAVEIS_AUTOMATICAS = [
  "nome",
  "primeiro_nome",
  "empresa",
  "loja",
  "link",
] as const;

export const VARIAVEIS_DIGITADAS = [
  "cupom",
  "desconto",
  "validade",
  "data",
] as const;

export type VariavelAuto = (typeof VARIAVEIS_AUTOMATICAS)[number];
export type VariavelDigitada = (typeof VARIAVEIS_DIGITADAS)[number];

// Metadados para a UI (rotulo + exemplo de preview).
export const INFO_VARIAVEL: Record<
  string,
  { rotulo: string; exemplo: string; tipo: "auto" | "digitada" }
> = {
  nome: { rotulo: "Nome", exemplo: "Maria Silva", tipo: "auto" },
  primeiro_nome: { rotulo: "Primeiro nome", exemplo: "Maria", tipo: "auto" },
  empresa: { rotulo: "Empresa", exemplo: "Acme", tipo: "auto" },
  loja: { rotulo: "Loja", exemplo: LOJA_NOME, tipo: "auto" },
  link: { rotulo: "Link da loja", exemplo: linkLoja(), tipo: "auto" },
  cupom: { rotulo: "Cupom", exemplo: "SIXXIS10", tipo: "digitada" },
  desconto: { rotulo: "Desconto", exemplo: "10%", tipo: "digitada" },
  validade: { rotulo: "Validade", exemplo: "30/06", tipo: "digitada" },
  data: { rotulo: "Data", exemplo: "25/12", tipo: "digitada" },
};

const RE_VAR = /\{(\w+)\}/g;

// Lista as variaveis presentes no texto, separadas por tipo (sem duplicar).
// Variaveis nao reconhecidas sao ignoradas (mantidas como literais ao aplicar).
export function detectarVariaveis(texto: string): {
  automaticas: string[];
  digitadas: string[];
} {
  const auto = new Set<string>();
  const dig = new Set<string>();
  for (const m of texto.matchAll(RE_VAR)) {
    const nome = m[1];
    if ((VARIAVEIS_AUTOMATICAS as readonly string[]).includes(nome)) auto.add(nome);
    else if ((VARIAVEIS_DIGITADAS as readonly string[]).includes(nome)) dig.add(nome);
  }
  return { automaticas: [...auto], digitadas: [...dig] };
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

// Sorteia uma redacao entre as opcoes (ignora vazias). Sempre devolve uma string.
export function sortearRedacao(textos: (string | null | undefined)[]): string {
  const validas = textos.filter((t): t is string => !!t && t.trim().length > 0);
  if (validas.length === 0) return "";
  const i = Math.floor(Math.random() * validas.length);
  return validas[i];
}

// Aplica o modelo: resolve automaticas do lead/contexto e digitadas dos valores
// informados. Quando ctx.variacoes existir, sorteia UMA redacao entre
// [texto, ...variacoes] antes de substituir (recipientes diferentes recebem
// redacoes diferentes). Variaveis sem valor viram string vazia; desconhecidas
// permanecem como literais.
export function aplicarModelo(
  texto: string,
  ctx: {
    lead?: LeadModelo | null;
    valoresDigitados?: Record<string, string>;
    variacoes?: string[];
  },
): string {
  const lead = ctx.lead ?? null;
  const valores = ctx.valoresDigitados ?? {};
  const base =
    ctx.variacoes && ctx.variacoes.length > 0
      ? sortearRedacao([texto, ...ctx.variacoes])
      : texto;
  const auto: Record<string, string> = {
    nome: lead?.nomeEfetivo ?? "",
    primeiro_nome: lead ? primeiroNome(lead.nomeEfetivo) : "",
    empresa: lead?.empresa ?? "",
    loja: LOJA_NOME,
    link: linkLoja(),
  };

  return base.replace(RE_VAR, (literal, nome: string) => {
    if (nome in auto) return auto[nome];
    if ((VARIAVEIS_DIGITADAS as readonly string[]).includes(nome)) {
      return valores[nome] ?? "";
    }
    return literal;
  });
}

// Categorias de modelo (rotulos para a UI).
export const CATEGORIAS_MODELO: { valor: string; rotulo: string }[] = [
  { valor: "atalho", rotulo: "Atalho" },
  { valor: "aniversario", rotulo: "Aniversario" },
  { valor: "cupom", rotulo: "Cupom" },
  { valor: "data_comemorativa", rotulo: "Data comemorativa" },
  { valor: "desconto_relampago", rotulo: "Desconto relampago" },
  { valor: "retomada", rotulo: "Retomada de interesse" },
  { valor: "boas_vindas", rotulo: "Boas-vindas" },
  { valor: "agradecimento", rotulo: "Agradecimento pos-compra" },
  { valor: "avaliacao", rotulo: "Pedido de avaliacao" },
  { valor: "follow_up", rotulo: "Follow-up pos-venda" },
  { valor: "geral", rotulo: "Geral" },
];

export function rotuloCategoria(valor: string): string {
  return CATEGORIAS_MODELO.find((c) => c.valor === valor)?.rotulo ?? valor;
}

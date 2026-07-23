// Nucleo da Fatia AA: mesclagem CRM x Loja. PONTO UNICO usado pelo PREVIEW
// (GET) e pela APLICACAO (POST) da rota /api/leads/[id]/sincronizar-loja, para
// que a classificacao seja identica nos dois lados (o POST recomputa e nunca
// confia em valor vindo do cliente — so nas CHAVES marcadas).
//
// Regra de mesclagem (o coracao da fatia):
//   a) CRM vazio + Loja tem valor      -> "preencher" (pre-marcado na UI)
//   b) CRM e Loja iguais               -> "igual"     (nao vira acao)
//   c) CRM tem valor e Loja tem OUTRO  -> "conflito"  (desmarcado; usuario opta)
// NOME: o efetivo e nomeManual||pushName||nome. Se ha nomeManual, e curadoria
// humana -> SEMPRE conflito (nunca preencher por cima).
import type { ClienteLoja, PedidoLoja, EnderecoLoja } from "./loja";

export type Classificacao = "preencher" | "conflito" | "igual";
export type GrupoCampo = "cadastro" | "endereco" | "nota" | "rastreio";

export type CampoSync = {
  chave: string;
  rotulo: string;
  grupo: GrupoCampo;
  valorCrm: string | null;
  valorLoja: string | null;
  classificacao: Classificacao;
};

// Endereco principal atual do CRM (ou tudo null quando nao ha).
export type EnderecoCrm = {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

// Estado atual do CRM necessario para a mesclagem (montado pela rota a partir do
// banco). codigosRastreio = null sinaliza que NAO ha negocio resolvido (rastreio
// entao nem e oferecido).
export type EstadoCrm = {
  nomeEfetivo: string;
  temNomeManual: boolean;
  cpf: string | null;
  email: string | null;
  empresa: string | null;
  endereco: EnderecoCrm;
  numerosNF: string[];
  codigosRastreio: string[] | null;
};

export type Analise = {
  pedidoUsado: PedidoLoja | null;
  campos: CampoSync[];
  // Valores da loja normalizados por chave, para o POST aplicar SEM reparsear.
  valores: Record<string, string | null>;
  // Data crua da NF (ISO) quando a loja mandou uma valida; senao null.
  dataNF: string | null;
  transportadora: string | null;
  avisos: string[];
};

const CAMPOS_ENDERECO = [
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
] as const;

const ROTULOS: Record<string, string> = {
  nome: "Nome",
  cpf: "CPF",
  email: "E-mail",
  empresa: "Empresa",
  cep: "CEP",
  logradouro: "Logradouro",
  numero: "Numero",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "UF",
  notaFiscal: "Nota fiscal",
  codigoRastreio: "Codigo de rastreio",
};

// Texto -> valor util ou null (sem espacos nas pontas). Numeros viram string.
function limpar(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Comparacao para decidir igual x conflito: sem acento nao dobra (conservador —
// "Jose" vs "Jose" com acento vira conflito e o usuario decide). So trim + minusculas.
function iguais(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Escolhe o pedido: por id, senao o mais recente (maior criadoEm).
export function escolherPedido(
  cliente: ClienteLoja,
  pedidoId?: string | null,
): PedidoLoja | null {
  const pedidos = cliente.pedidos ?? [];
  if (pedidos.length === 0) return null;
  if (pedidoId) {
    const achado = pedidos.find((p) => p.id === pedidoId);
    if (achado) return achado;
  }
  return pedidos.reduce((mais, p) =>
    new Date(p.criadoEm).getTime() > new Date(mais.criadoEm).getTime() ? p : mais,
  );
}

function enderecoLojaCampo(
  end: EnderecoLoja | null | undefined,
  campo: (typeof CAMPOS_ENDERECO)[number],
): string | null {
  if (!end) return null;
  if (campo === "uf") return limpar(end.uf ?? end.estado);
  return limpar(end[campo]);
}

// Valores da loja por chave (pedido tem prioridade; cliente e fallback).
function valoresLoja(
  cliente: ClienteLoja,
  pedido: PedidoLoja | null,
): Record<string, string | null> {
  const c = cliente.cliente;
  const v: Record<string, string | null> = {
    nome: limpar(c?.nome),
    cpf: limpar(pedido?.cpf ?? c?.cpf),
    email: limpar(c?.email),
    empresa: limpar(c?.empresa),
    notaFiscal: limpar(pedido?.notaFiscal),
    codigoRastreio: limpar(pedido?.codigoRastreio),
    transportadora: limpar(
      pedido?.transportadora ?? pedido?.rastreio?.transportadora,
    ),
  };
  for (const campo of CAMPOS_ENDERECO) {
    v[campo] =
      enderecoLojaCampo(pedido?.endereco, campo) ??
      enderecoLojaCampo(c?.endereco, campo);
  }
  if (v.uf) v.uf = v.uf.toUpperCase().slice(0, 2);
  return v;
}

// Classificacao generica (preencher/conflito/igual) a partir de crm x loja.
// Retorna null quando a loja nao tem valor (campo nem entra na lista).
function classificar(
  valorCrm: string | null,
  valorLoja: string | null,
): Classificacao | null {
  if (valorLoja === null) return null;
  if (valorCrm === null) return "preencher";
  if (iguais(valorCrm, valorLoja)) return "igual";
  return "conflito";
}

// Nucleo compartilhado: monta a lista de campos + valores para preview e apply.
export function analisar(
  estado: EstadoCrm,
  cliente: ClienteLoja,
  pedidoId?: string | null,
): Analise {
  const pedido = escolherPedido(cliente, pedidoId);
  const valores = valoresLoja(cliente, pedido);
  const campos: CampoSync[] = [];
  const avisos: string[] = [];

  const push = (
    chave: string,
    grupo: GrupoCampo,
    valorCrm: string | null,
    valorLoja: string | null,
    classificacao: Classificacao,
  ) => {
    campos.push({
      chave,
      rotulo: ROTULOS[chave] ?? chave,
      grupo,
      valorCrm,
      valorLoja,
      classificacao,
    });
  };

  // --- Nome (especial: nomeManual = curadoria -> conflito) ---
  if (valores.nome !== null) {
    if (iguais(estado.nomeEfetivo, valores.nome)) {
      push("nome", "cadastro", estado.nomeEfetivo, valores.nome, "igual");
    } else if (estado.temNomeManual) {
      push("nome", "cadastro", estado.nomeEfetivo, valores.nome, "conflito");
    } else {
      push("nome", "cadastro", estado.nomeEfetivo, valores.nome, "preencher");
    }
  }

  // --- Cadastro generico ---
  for (const chave of ["cpf", "email", "empresa"] as const) {
    const crm = estado[chave];
    const cls = classificar(crm, valores[chave]);
    if (cls) push(chave, "cadastro", crm, valores[chave], cls);
  }

  // --- Endereco (compara com o principal atual) ---
  for (const chave of CAMPOS_ENDERECO) {
    const crm = estado.endereco[chave];
    const cls = classificar(crm, valores[chave]);
    if (cls) push(chave, "endereco", crm, valores[chave], cls);
  }

  // --- Nota fiscal (aditiva; exige data; idempotente pelo numero) ---
  let dataNF: string | null = null;
  if (valores.notaFiscal !== null) {
    const dataCrua = limpar(pedido?.dataNotaFiscal);
    const dataOk = dataCrua && !Number.isNaN(new Date(dataCrua).getTime());
    if (!dataOk) {
      avisos.push(
        `Nota fiscal ${valores.notaFiscal} encontrada na loja, mas sem data — nao sincronizavel (a data e o relogio da garantia).`,
      );
    } else if (estado.numerosNF.includes(valores.notaFiscal)) {
      push("notaFiscal", "nota", valores.notaFiscal, valores.notaFiscal, "igual");
    } else {
      dataNF = dataCrua;
      push("notaFiscal", "nota", null, valores.notaFiscal, "preencher");
    }
  }

  // --- Rastreio (exige negocio; idempotente pelo codigo) ---
  if (valores.codigoRastreio !== null) {
    if (estado.codigosRastreio === null) {
      avisos.push(
        `Codigo de rastreio ${valores.codigoRastreio} encontrado na loja, mas nao ha negocio para vincula-lo.`,
      );
    } else if (estado.codigosRastreio.includes(valores.codigoRastreio)) {
      push(
        "codigoRastreio",
        "rastreio",
        valores.codigoRastreio,
        valores.codigoRastreio,
        "igual",
      );
    } else {
      push(
        "codigoRastreio",
        "rastreio",
        null,
        valores.codigoRastreio,
        "preencher",
      );
    }
  }

  return {
    pedidoUsado: pedido,
    campos,
    valores,
    dataNF,
    transportadora: valores.transportadora,
    avisos,
  };
}

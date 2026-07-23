// Nucleo da sincronizacao CRM x Loja (Fatias AA/AB). PONTO UNICO de comparacao.
//
// Fatia AB inverteu o fluxo: os dados agora CHEGAM na requisicao (a Loja chama o
// CRM). Por isso a comparacao virou PURA — `analisarValores(estado, valores)` —
// recebendo um objeto de valores externos e o estado atual do lead, sem saber de
// onde os valores vieram. `analisar(estado, cliente, pedidoId)` continua para uso
// interno (obtem os valores da Loja e delega para a funcao pura), sem duplicar a
// classificacao.
//
// Regra de mesclagem (o coracao da fatia):
//   a) CRM vazio + Loja tem valor      -> "preencher" (pre-marcado na UI)
//   b) CRM e Loja iguais               -> "igual"     (nao vira acao)
//   c) CRM tem valor e Loja tem OUTRO  -> "conflito"  (desmarcado; usuario opta)
// NOME: "preencher" so quando NAO ha nome real no CRM (nem nomeManual, nem
// pushName, nem nome). Qualquer nome real diferente -> "conflito".
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

// Valores externos a comparar (o `dados` das rotas de entrada da Fatia AB, e
// tambem o que `analisar` monta a partir da Loja). Tudo opcional.
export type ValoresExternos = {
  nome?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  email?: string | null;
  // Empresa DO CLIENTE (texto livre -> Lead.empresa). NUNCA e a empresa que
  // fatura (Lead.empresaFaturadaId), que esta fora do escopo desta sincronizacao.
  empresa?: string | null;
  // Razao social do cadastro PJ. Mapeia para Lead.empresa e TEM PRECEDENCIA sobre
  // `empresa` quando ambos vierem (e o dado formal do cadastro PJ).
  razaoSocial?: string | null;
  endereco?: {
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
  } | null;
  notaFiscal?: { numero?: string | null; data?: string | null } | null;
  rastreio?: { codigo?: string | null; transportadora?: string | null } | null;
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
  // Ha QUALQUER nome real no CRM (nomeManual || pushName || nome)? nomeEfetivo
  // cai no telefone quando nao ha nome, entao nunca e vazio; este flag e o que
  // distingue "CRM vazio" (preencher) de "CRM tem nome diferente" (conflito).
  temNomeReal: boolean;
  cpf: string | null;
  cnpj: string | null;
  email: string | null;
  empresa: string | null;
  endereco: EnderecoCrm;
  numerosNF: string[];
  codigosRastreio: string[] | null;
};

export type Analise = {
  // Pedido da loja usado (so quando os valores vieram da Loja via `analisar`).
  pedidoUsado: PedidoLoja | null;
  campos: CampoSync[];
  // Valores normalizados por chave, para o POST aplicar SEM reparsear.
  valores: Record<string, string | null>;
  // Data crua da NF (ISO) quando ha uma valida e a NF ainda nao existe; senao null.
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
  cnpj: "CNPJ",
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

// So os digitos de um texto (para comparar/gravar documentos sem mascara).
export function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

// Campos comparados por CONTEUDO (so digitos), nao por formatacao: CPF/CNPJ/CEP.
// "123.456.789-00" e "12345678900" sao o MESMO valor -> "igual", nao "conflito".
const CHAVES_DIGITO = new Set(["cpf", "cnpj", "cep"]);

// Classificacao generica (preencher/conflito/igual) a partir de crm x loja.
// Retorna null quando a loja nao tem valor (campo nem entra na lista).
function classificar(
  chave: string,
  valorCrm: string | null,
  valorLoja: string | null,
): Classificacao | null {
  if (valorLoja === null) return null;
  if (valorCrm === null) return "preencher";
  const mesmo = CHAVES_DIGITO.has(chave)
    ? soDigitos(valorCrm) === soDigitos(valorLoja)
    : iguais(valorCrm, valorLoja);
  return mesmo ? "igual" : "conflito";
}

// Achata ValoresExternos no mapa por chave usado pela classificacao/aplicacao,
// e devolve a data crua da NF em separado (nao e um campo comparavel).
function flatDeExternos(v: ValoresExternos): {
  flat: Record<string, string | null>;
  dataNFbruta: string | null;
} {
  const flat: Record<string, string | null> = {
    nome: limpar(v.nome),
    cpf: limpar(v.cpf),
    cnpj: limpar(v.cnpj),
    email: limpar(v.email),
    // razaoSocial tem precedencia sobre empresa (dado formal do cadastro PJ).
    empresa: limpar(v.razaoSocial) ?? limpar(v.empresa),
    notaFiscal: limpar(v.notaFiscal?.numero),
    codigoRastreio: limpar(v.rastreio?.codigo),
    transportadora: limpar(v.rastreio?.transportadora),
  };
  for (const campo of CAMPOS_ENDERECO) {
    flat[campo] = limpar(v.endereco?.[campo]);
  }
  if (flat.uf) flat.uf = flat.uf.toUpperCase().slice(0, 2);
  return { flat, dataNFbruta: limpar(v.notaFiscal?.data) };
}

// ===========================================================================
// (b) COMPARAR/CLASSIFICAR — funcao PURA. Recebe o estado do lead + valores
// externos e devolve os campos classificados. Nao busca nada, nao grava nada.
// ===========================================================================
export function analisarValores(
  estado: EstadoCrm,
  valoresExternos: ValoresExternos,
): Analise {
  const { flat, dataNFbruta } = flatDeExternos(valoresExternos);
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

  // --- Nome ---
  // "preencher" = CRM VAZIO (sem nome real: nem nomeManual, nem pushName, nem
  // nome). Se ha QUALQUER nome real e ele difere do da loja -> "conflito"
  // (desmarcado, "vai substituir"), seja pushName do WhatsApp ou nomeManual
  // curado pelo atendente. Nunca sobrescrever nome existente sem opt-in.
  if (flat.nome !== null) {
    if (iguais(estado.nomeEfetivo, flat.nome)) {
      push("nome", "cadastro", estado.nomeEfetivo, flat.nome, "igual");
    } else if (!estado.temNomeReal) {
      push("nome", "cadastro", estado.nomeEfetivo, flat.nome, "preencher");
    } else {
      push("nome", "cadastro", estado.nomeEfetivo, flat.nome, "conflito");
    }
  }

  // --- Cadastro generico (cpf/cnpj comparados por digitos via CHAVES_DIGITO) ---
  for (const chave of ["cpf", "cnpj", "email", "empresa"] as const) {
    const crm = estado[chave];
    const cls = classificar(chave, crm, flat[chave]);
    if (cls) push(chave, "cadastro", crm, flat[chave], cls);
  }

  // --- Endereco (compara com o principal atual) ---
  for (const chave of CAMPOS_ENDERECO) {
    const crm = estado.endereco[chave];
    const cls = classificar(chave, crm, flat[chave]);
    if (cls) push(chave, "endereco", crm, flat[chave], cls);
  }

  // --- Nota fiscal (aditiva; exige data; idempotente pelo numero) ---
  let dataNF: string | null = null;
  if (flat.notaFiscal !== null) {
    const dataOk = dataNFbruta && !Number.isNaN(new Date(dataNFbruta).getTime());
    if (!dataOk) {
      avisos.push(
        `Nota fiscal ${flat.notaFiscal} recebida, mas sem data valida — nao sincronizavel (a data e o relogio da garantia).`,
      );
    } else if (estado.numerosNF.includes(flat.notaFiscal)) {
      push("notaFiscal", "nota", flat.notaFiscal, flat.notaFiscal, "igual");
    } else {
      dataNF = dataNFbruta;
      push("notaFiscal", "nota", null, flat.notaFiscal, "preencher");
    }
  }

  // --- Rastreio (exige negocio; idempotente pelo codigo) ---
  if (flat.codigoRastreio !== null) {
    if (estado.codigosRastreio === null) {
      avisos.push(
        `Codigo de rastreio ${flat.codigoRastreio} recebido, mas nao ha negocio para vincula-lo.`,
      );
    } else if (estado.codigosRastreio.includes(flat.codigoRastreio)) {
      push(
        "codigoRastreio",
        "rastreio",
        flat.codigoRastreio,
        flat.codigoRastreio,
        "igual",
      );
    } else {
      push("codigoRastreio", "rastreio", null, flat.codigoRastreio, "preencher");
    }
  }

  return {
    pedidoUsado: null,
    campos,
    valores: flat,
    dataNF,
    transportadora: flat.transportadora,
    avisos,
  };
}

// ===========================================================================
// (a) OBTER valores da LOJA (uso interno). Escolhe o pedido, mapeia para
// ValoresExternos e delega para a funcao pura acima (zero duplicacao).
// ===========================================================================

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

// Mapeia cliente+pedido da loja para ValoresExternos (pedido tem prioridade;
// cliente e fallback).
function externosDaLoja(
  cliente: ClienteLoja,
  pedido: PedidoLoja | null,
): ValoresExternos {
  const c = cliente.cliente;
  const endereco: NonNullable<ValoresExternos["endereco"]> = {};
  for (const campo of CAMPOS_ENDERECO) {
    endereco[campo] =
      enderecoLojaCampo(pedido?.endereco, campo) ??
      enderecoLojaCampo(c?.endereco, campo);
  }
  return {
    nome: c?.nome,
    cpf: pedido?.cpf ?? c?.cpf,
    cnpj: c?.cnpj,
    email: c?.email,
    empresa: c?.empresa,
    endereco,
    notaFiscal: pedido?.notaFiscal
      ? { numero: pedido.notaFiscal, data: pedido.dataNotaFiscal ?? null }
      : null,
    rastreio: pedido?.codigoRastreio
      ? {
          codigo: pedido.codigoRastreio,
          transportadora:
            pedido.transportadora ?? pedido.rastreio?.transportadora ?? null,
        }
      : null,
  };
}

// Entrada interna (rota antiga por leadId): obtem valores da Loja e classifica.
export function analisar(
  estado: EstadoCrm,
  cliente: ClienteLoja,
  pedidoId?: string | null,
): Analise {
  const pedido = escolherPedido(cliente, pedidoId);
  const res = analisarValores(estado, externosDaLoja(cliente, pedido));
  return { ...res, pedidoUsado: pedido };
}

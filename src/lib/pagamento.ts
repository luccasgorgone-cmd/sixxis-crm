// Formas de pagamento do orcamento (Fatia 3.18). Descreve COMO o cliente paga —
// e METADADO: NAO altera o total do pedido nem a conversao Meta. Pode DIVIDIR em
// mais de um metodo (split). Compartilhado por UI, PATCH, snapshot e PDF.
//
// Rascunho VIVO: Negocio.orcPagamentos (editavel enquanto o orcamento esta aberto).
// Snapshot: Orcamento.pagamentos (congela na decisao/GANHO). Mesmo shape nos dois.

// Metodo parcelavel => aceita `parcelas` > 1 (1..24). Os demais sao sempre a vista.
export type MetodoPagamentoCode =
  | "CREDITO"
  | "DEBITO"
  | "BOLETO"
  | "PIX"
  | "DINHEIRO";

export type MetodoPagamentoDef = {
  code: MetodoPagamentoCode;
  label: string;
  parcelavel: boolean;
};

export const METODOS_PAGAMENTO: MetodoPagamentoDef[] = [
  { code: "CREDITO", label: "Cartão de Crédito", parcelavel: true },
  { code: "DEBITO", label: "Cartão de Débito", parcelavel: false },
  { code: "BOLETO", label: "Boleto", parcelavel: true },
  { code: "PIX", label: "Pix", parcelavel: false },
  { code: "DINHEIRO", label: "Dinheiro", parcelavel: false },
];

// Uma linha de pagamento (o cliente pode ter varias = split). parcelas so faz
// sentido em metodo parcelavel; nos demais e sempre 1.
export type LinhaPagamento = {
  metodo: MetodoPagamentoCode;
  valor: number;
  parcelas: number;
};

export const MAX_PARCELAS = 24;

export function ehMetodoValido(code: unknown): code is MetodoPagamentoCode {
  return (
    typeof code === "string" &&
    METODOS_PAGAMENTO.some((m) => m.code === code)
  );
}

export function metodoPagamento(
  code: MetodoPagamentoCode,
): MetodoPagamentoDef | null {
  return METODOS_PAGAMENTO.find((m) => m.code === code) ?? null;
}

export function labelMetodo(code: MetodoPagamentoCode): string {
  return metodoPagamento(code)?.label ?? code;
}

export function ehParcelavel(code: MetodoPagamentoCode): boolean {
  return metodoPagamento(code)?.parcelavel === true;
}

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Linha legivel de uma forma de pagamento:
//  - parcelado (>1): "Cartão de Crédito 3x de R$ X (total R$ Y)"
//  - a vista:        "Pix R$ Y"
export function formatarLinhaPagamento(linha: LinhaPagamento): string {
  const label = labelMetodo(linha.metodo);
  const parcelas = Math.max(1, Math.floor(linha.parcelas || 1));
  if (parcelas > 1) {
    const parcela = linha.valor / parcelas;
    return `${label} ${parcelas}x de ${brl(parcela)} (total ${brl(linha.valor)})`;
  }
  return `${label} ${brl(linha.valor)}`;
}

// Normaliza + valida um array cru (do body do PATCH ou de um Json persistido).
// Retorna { ok, linhas } ou { ok:false, erro }. Regras:
//  - metodo valido (5 codes);
//  - valor numero finito >= 0;
//  - parcelas inteiro em 1..24; so pode ser > 1 se o metodo for parcelavel.
// Array vazio e valido (sem forma informada). null/undefined => [] (limpa).
export function normalizarPagamentos(
  cru: unknown,
):
  | { ok: true; linhas: LinhaPagamento[] }
  | { ok: false; erro: string } {
  if (cru === null || cru === undefined) return { ok: true, linhas: [] };
  if (!Array.isArray(cru)) {
    return { ok: false, erro: "formas de pagamento inválidas" };
  }
  const linhas: LinhaPagamento[] = [];
  for (const item of cru) {
    if (!item || typeof item !== "object") {
      return { ok: false, erro: "forma de pagamento inválida" };
    }
    const obj = item as Record<string, unknown>;
    if (!ehMetodoValido(obj.metodo)) {
      return { ok: false, erro: "método de pagamento inválido" };
    }
    const metodo = obj.metodo;
    const valor = Number(obj.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      return { ok: false, erro: "valor de pagamento inválido" };
    }
    const parcelasCru = obj.parcelas === undefined ? 1 : Number(obj.parcelas);
    if (
      !Number.isFinite(parcelasCru) ||
      !Number.isInteger(parcelasCru) ||
      parcelasCru < 1 ||
      parcelasCru > MAX_PARCELAS
    ) {
      return { ok: false, erro: `parcelas devem ser inteiro de 1 a ${MAX_PARCELAS}` };
    }
    if (parcelasCru > 1 && !ehParcelavel(metodo)) {
      return {
        ok: false,
        erro: `${labelMetodo(metodo)} não é parcelável`,
      };
    }
    linhas.push({
      metodo,
      valor: Math.round(valor * 100) / 100,
      parcelas: ehParcelavel(metodo) ? parcelasCru : 1,
    });
  }
  return { ok: true, linhas };
}

// Soma dos valores das linhas (o "pago"). Usado no resumo pago vs total.
export function somaPagamentos(linhas: LinhaPagamento[]): number {
  return Math.round(linhas.reduce((a, l) => a + (l.valor || 0), 0) * 100) / 100;
}

// Le um Json persistido (rascunho/snapshot) como LinhaPagamento[] confiavel.
// Descarta o array inteiro se for invalido (defensivo na leitura). Nunca lanca.
export function lerPagamentos(cru: unknown): LinhaPagamento[] {
  const r = normalizarPagamentos(cru);
  return r.ok ? r.linhas : [];
}

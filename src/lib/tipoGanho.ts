// Tipo do GANHO no POS-VENDA (Negocio.tipoGanho, enum TipoGanho no banco).
// Escolhido no fechamento e usado para separar os resolvidos nos relatorios.
// Compartilhado entre UI (seletor, rotulos), API (validacao) e metricas.
//
// Vale SO para finalidade POS_VENDA: a venda nunca preenche o campo. Ganho
// antigo (anterior a fatia) fica null e conta como "Nao classificado".

export type CodigoTipoGanho = "DUVIDA" | "PAGAMENTO" | "GARANTIA";

export type TipoGanhoInfo = {
  code: CodigoTipoGanho;
  label: string;
  // Frase curta de apoio no seletor do fechamento.
  ajuda: string;
};

export const TIPOS_GANHO: TipoGanhoInfo[] = [
  {
    code: "DUVIDA",
    label: "Só dúvida",
    ajuda: "Cliente só tinha uma pergunta — sem pedido e sem cobrança.",
  },
  {
    code: "PAGAMENTO",
    label: "Pagamento",
    ajuda: "Houve venda de peça ou serviço com pagamento.",
  },
  {
    code: "GARANTIA",
    label: "Garantia",
    ajuda: "Resolvido dentro da garantia, sem cobrar do cliente.",
  },
];

const POR_CODE = new Map(TIPOS_GANHO.map((t) => [t.code, t]));

// Rotulo do ganho SEM tipo: ganhos antigos e qualquer coisa fora da lista.
export const ROTULO_SEM_TIPO = "Não classificado";

export function ehTipoGanho(valor: unknown): valor is CodigoTipoGanho {
  return typeof valor === "string" && POR_CODE.has(valor as CodigoTipoGanho);
}

// Normaliza o que veio do corpo da requisicao: devolve o code valido ou null
// (nunca lanca). Aceita minusculo/espacos por seguranca.
export function lerTipoGanho(valor: unknown): CodigoTipoGanho | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toUpperCase();
  return ehTipoGanho(v) ? v : null;
}

export function rotuloTipoGanho(code: string | null | undefined): string {
  if (!code) return ROTULO_SEM_TIPO;
  return POR_CODE.get(code as CodigoTipoGanho)?.label ?? code;
}

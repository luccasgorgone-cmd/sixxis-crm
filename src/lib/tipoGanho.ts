// Tipo do GANHO (Negocio.tipoGanho, enum TipoGanho no banco). Escolhido no
// fechamento e usado para separar os resolvidos nos relatorios. Compartilhado
// entre UI (seletor, rotulos), API (validacao) e metricas.
//
// Dois usos:
//  1) POS_VENDA: classifica todo ganho de pos-venda (DUVIDA/PAGAMENTO/GARANTIA).
//  2) VENDA de RETORNO (frente 4): cliente que JA comprou (negocio.jaFoiGanho)
//     volta so para tirar duvida, pedir codigo de rastreio ou outro motivo —
//     fecha como GANHO SEM contabilizar valor (valor=0), marcado com o motivo
//     (DUVIDA/RASTREIO/OUTRO). Nao dispara Purchase no Meta (gate valor>0) nem
//     soma faturamento (valorGanho=0). Evita ter de marcar perdido/ganho de novo.
//
// Uma VENDA NOVA (nunca ganha) continua exigindo valor > 0 e nunca preenche o
// campo. Ganho antigo (anterior a fatia) fica null = "Nao classificado".

export type CodigoTipoGanho =
  | "DUVIDA"
  | "PAGAMENTO"
  | "GARANTIA"
  | "RASTREIO"
  | "OUTRO";

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
  {
    code: "RASTREIO",
    label: "Codigo de rastreio",
    ajuda: "So pediu o codigo de rastreio do pedido — sem nova cobranca.",
  },
  {
    code: "OUTRO",
    label: "Outro motivo",
    ajuda: "Retorno sem nova compra — sem cobranca.",
  },
];

// Motivos de GANHO "sem valor": o cliente que ja comprou voltou so para um
// atendimento (duvida, rastreio ou outro) — fecha GANHO com valor ZERO, sem
// faturamento e sem Purchase. PAGAMENTO e uma venda de verdade; GARANTIA e
// resolucao de pos-venda com pedido proprio — ambos ficam de fora desta lista.
export const TIPOS_GANHO_SEM_VALOR: CodigoTipoGanho[] = [
  "DUVIDA",
  "RASTREIO",
  "OUTRO",
];

// True quando o motivo informado e um retorno SEM valor (fecha ganho em zero).
export function ehGanhoSemValor(code: string | null | undefined): boolean {
  return !!code && (TIPOS_GANHO_SEM_VALOR as string[]).includes(code);
}

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

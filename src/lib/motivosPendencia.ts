// Lista FIXA de motivos de PENDENCIA de um negocio (Fatia 3.17). Espelha
// lib/motivosPerda: Negocio.motivoPendenciaCode guarda o CODE; motivoPendencia
// guarda a observacao livre (obrigatoria em OUTRO, complemento nos demais).
// Compartilhado entre UI (seletor, rotulos) e API (rastreio/agregacao de pendentes).
// Motivos pensados para o negocio (venda + pos-venda de climatizadores).

export type MotivoPendencia = { code: string; label: string };

export const MOTIVOS_PENDENCIA: MotivoPendencia[] = [
  { code: "AGUARDANDO_CLIENTE", label: "Aguardando resposta do cliente" },
  { code: "AGUARDANDO_PAGAMENTO", label: "Aguardando pagamento" },
  { code: "AGUARDANDO_ESTOQUE", label: "Aguardando peça / estoque" },
  { code: "NEGOCIANDO", label: "Em negociação / avaliando proposta" },
  { code: "AGENDADO", label: "Retorno agendado" },
  { code: "ANALISE_INTERNA", label: "Análise interna / aprovação" },
  { code: "AGUARDANDO_NF", label: "Aguardando nota fiscal / faturamento" },
  { code: "AGUARDANDO_TECNICO", label: "Aguardando visita / laudo técnico" },
  { code: "OUTRO", label: "Outro" },
];

const POR_CODE = new Map(MOTIVOS_PENDENCIA.map((m) => [m.code, m]));

export function ehCodigoPendencia(code: string): boolean {
  return POR_CODE.has(code);
}

// Rotulo de um motivo de pendencia. Se o valor guardado nao for um CODE conhecido
// (legado: texto livre antigo), devolve o proprio valor para nao perder a info.
export function rotuloPendencia(codeOuTexto: string | null | undefined): string {
  if (!codeOuTexto) return "Sem motivo";
  return POR_CODE.get(codeOuTexto)?.label ?? codeOuTexto;
}

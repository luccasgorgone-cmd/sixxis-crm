// Lista FIXA de motivos de perda de um negocio. O Negocio.motivoPerda passa a
// guardar o CODE; motivoPerdaObs guarda uma observacao livre (obrigatoria em OUTRO).
// Compartilhado entre UI (seletor, rotulos) e API (analise de perdidos).

export type MotivoPerda = { code: string; label: string };

export const MOTIVOS_PERDA: MotivoPerda[] = [
  { code: "NAO_RESPONDE", label: "Cliente não responde" },
  { code: "SEM_INTERESSE", label: "Sem interesse" },
  { code: "ACHOU_CARO", label: "Achou caro / fora do orçamento" },
  { code: "CONCORRENTE", label: "Comprou com concorrente" },
  { code: "CONFUSO", label: "Confuso / não entendeu" },
  { code: "FORA_AREA", label: "Fora da área de entrega" },
  { code: "INDISPONIVEL", label: "Produto indisponível" },
  { code: "SO_PESQUISANDO", label: "Só pesquisando preço" },
  { code: "DESISTIU", label: "Desistiu da compra" },
  { code: "PAGAMENTO", label: "Problema no pagamento" },
  { code: "CONTATO_ERRADO", label: "Contato errado / duplicado" },
  { code: "OUTRO", label: "Outro" },
];

const POR_CODE = new Map(MOTIVOS_PERDA.map((m) => [m.code, m]));

export function ehCodigoMotivo(code: string): boolean {
  return POR_CODE.has(code);
}

// Rotulo de um motivo. Se o valor guardado nao for um CODE conhecido (legado:
// texto livre antigo), devolve o proprio valor para nao perder a informacao.
export function rotuloMotivo(codeOuTexto: string | null | undefined): string {
  if (!codeOuTexto) return "Sem motivo";
  return POR_CODE.get(codeOuTexto)?.label ?? codeOuTexto;
}

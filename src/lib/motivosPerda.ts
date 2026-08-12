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

// MARCADOR dos duplicados NEUTRALIZADOS por /api/admin/corrigir-duplicados: um
// negocio que era copia de outro e virou perdido so para sair da carteira (o
// mesmo valor contava duas vezes). Nao e uma perda de verdade e por isso nao
// entra na analise de perdas — ver lib/perdidos.
//
// O QUE IDENTIFICA e o PAR code + observacao exata, nunca o code sozinho:
// "Contato errado / duplicado" tambem e escolhido A MAO por atendente numa
// perda legitima, e essa tem de continuar contando normalmente.
export const MOTIVO_DUPLICADO = "CONTATO_ERRADO";
export const OBS_DUPLICADO_AUTO = "Duplicado corrigido automaticamente";

export function ehDuplicadoNeutralizado(n: {
  motivoPerda: string | null;
  motivoPerdaObs: string | null;
}): boolean {
  return (
    n.motivoPerda === MOTIVO_DUPLICADO && n.motivoPerdaObs === OBS_DUPLICADO_AUTO
  );
}

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

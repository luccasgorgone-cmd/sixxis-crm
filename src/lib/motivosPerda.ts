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

// A MESMA regra acima, em WHERE, para quem filtra no banco em vez de em memoria.
// Mora colada na versao JS de proposito: as duas ja divergiram uma vez (a Fatia
// 14 filtrava em SQL e esqueceu deste caso, e um duplicado neutralizado voltou a
// somar no faturamento junto com o negocio que ele duplicava).
//
// ESCRITA COMO "OR DE NEGACOES", e nao como um NOT do par, por causa da logica
// de tres valores do SQL: num negocio sem motivo de perda as duas colunas sao
// NULL, `NULL = 'CONTATO_ERRADO'` da NULL, e um NOT em cima disso devolveria
// NULL — a linha sumiria do resultado. Como quase todo negocio vendido tem
// motivoPerda NULL, isso apagaria o faturamento inteiro. Os dois primeiros ramos
// tratam o NULL explicitamente (IS NULL), e basta um ramo verdadeiro para a
// linha passar.
export const WHERE_NAO_DUPLICADO_NEUTRALIZADO = {
  OR: [
    { motivoPerda: null },
    { motivoPerdaObs: null },
    { motivoPerda: { not: MOTIVO_DUPLICADO } },
    { motivoPerdaObs: { not: OBS_DUPLICADO_AUTO } },
  ],
};

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

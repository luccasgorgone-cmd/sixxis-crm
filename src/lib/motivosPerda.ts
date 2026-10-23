// Lista FECHADA de motivos de encerramento (Manual de Atendimento, seção 7).
// Negocio.motivoPerda guarda o CODE; motivoPerdaObs guarda observação livre.
// Cada motivo tem TIPO (PERDIDO ou DESQUALIFICADO) e se ENTRA NA REAQUISIÇÃO.
// Compartilhado entre UI (seletor agrupado), API (validação dura) e métricas.
// "Outro" não existe por desenho do manual: se nada se aplica, o vendedor avisa
// o gestor para incluir um novo código aqui.

export type TipoMotivo = "PERDIDO" | "DESQUALIFICADO";
export type MotivoPerda = {
  code: string;
  label: string;
  tipo: TipoMotivo;
  // Entra na reaquisição mensal de perdidos (seção 8)? Só PERDIDO pode entrar.
  entraReaquisicao: boolean;
  obsObrigatoria?: boolean;
};

export const MOTIVOS_PERDA: MotivoPerda[] = [
  // ───── PERDIDO ─────
  { code: "NAO_RESPONDE", label: "Sem resposta (fim da régua)", tipo: "PERDIDO", entraReaquisicao: true },
  { code: "ACHOU_CARO", label: "Preço acima do esperado", tipo: "PERDIDO", entraReaquisicao: true },
  { code: "FRETE_PRAZO", label: "Frete caro ou prazo de entrega longo", tipo: "PERDIDO", entraReaquisicao: true },
  { code: "CONCORRENTE", label: "Comprou de concorrente", tipo: "PERDIDO", entraReaquisicao: true },
  { code: "COMPROU_SITE", label: "Comprou no marketplace/site da SIXXIS", tipo: "PERDIDO", entraReaquisicao: false },
  { code: "ADIOU", label: "Adiou a compra / sem orçamento agora", tipo: "PERDIDO", entraReaquisicao: true },
  { code: "PRODUTO_NAO_ATENDE", label: "Produto não atende (tamanho, área, voltagem, modelo)", tipo: "PERDIDO", entraReaquisicao: true },
  { code: "NAO_CONTATAR", label: "Pediu para não ser contatado", tipo: "PERDIDO", entraReaquisicao: false },
  // ───── DESQUALIFICADO (não entra em follow-up nem reaquisição) ─────
  { code: "CONTATO_ERRADO", label: "Número errado / contato inválido", tipo: "DESQUALIFICADO", entraReaquisicao: false },
  { code: "SPAM", label: "Spam", tipo: "DESQUALIFICADO", entraReaquisicao: false },
  { code: "FORNECEDOR", label: "Fornecedor / não é cliente", tipo: "DESQUALIFICADO", entraReaquisicao: false },
  { code: "VAGA_EMPREGO", label: "Busca emprego", tipo: "DESQUALIFICADO", entraReaquisicao: false },
  { code: "FORA_AREA", label: "Fora da área de atendimento", tipo: "DESQUALIFICADO", entraReaquisicao: false },
  { code: "PRODUTO_NAO_VENDE", label: "Produto que a SIXXIS não vende", tipo: "DESQUALIFICADO", entraReaquisicao: false },
];

// Rótulos de códigos LEGADOS (removidos da lista nova) só para exibir histórico
// antigo sem perder informação. NÃO são oferecidos no seletor nem validados.
const ROTULOS_LEGADO: Record<string, string> = {
  SEM_INTERESSE: "Sem interesse (legado)",
  CONFUSO: "Confuso / não entendeu (legado)",
  INDISPONIVEL: "Produto indisponível (legado)",
  SO_PESQUISANDO: "Só pesquisando preço (legado)",
  DESISTIU: "Desistiu da compra (legado)",
  PAGAMENTO: "Problema no pagamento (legado)",
  OUTRO: "Outro (legado)",
};

// MARCADOR dos duplicados NEUTRALIZADOS por /api/admin/corrigir-duplicados: um
// negocio que era copia de outro e virou perdido so para sair da carteira (o
// mesmo valor contava duas vezes). Nao e uma perda de verdade e por isso nao
// entra na analise de perdas — ver lib/perdidos.
//
// O QUE IDENTIFICA e o PAR code + observacao exata, nunca o code sozinho:
// "Numero errado / contato invalido" tambem e escolhido A MAO por atendente numa
// desqualificacao legitima, e essa tem de continuar contando normalmente.
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

export function motivoEhDesqualificacao(code: string | null | undefined): boolean {
  return code ? POR_CODE.get(code)?.tipo === "DESQUALIFICADO" : false;
}

export function motivoEntraReaquisicao(code: string | null | undefined): boolean {
  return code ? POR_CODE.get(code)?.entraReaquisicao === true : false;
}

// Rotulo de um motivo. Code conhecido -> label do manual; code legado -> label
// marcado "(legado)"; texto livre antigo desconhecido -> o proprio valor.
export function rotuloMotivo(codeOuTexto: string | null | undefined): string {
  if (!codeOuTexto) return "Sem motivo";
  return POR_CODE.get(codeOuTexto)?.label ?? ROTULOS_LEGADO[codeOuTexto] ?? codeOuTexto;
}

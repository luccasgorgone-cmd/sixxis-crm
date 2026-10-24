// Núcleo PURO da cadência de 4 semanas da prospecção ativa (Manual Fase 2).
// Determinístico, sem banco. A fase esperada deriva das semanas de calendário
// desde o 1º contato; "sem resposta" exige o mínimo de tentativas/canais.
// Ver docs/superpowers/plans/2026-10-23-f5-prospeccao-fase2.md.

// União das fases DE TEMPO (as 4 ativas + NUTRICAO). Nome distinto do enum Prisma
// FaseProspeccao (que tem também QUALIFICADO/ENCERRADO, estados manuais) para não
// confundir os dois significados.
export type FaseCadencia =
  | "ABORDAGEM"
  | "QUALIFICACAO"
  | "PROPOSTA"
  | "FECHAMENTO"
  | "NUTRICAO";

const MS_DIA = 86_400_000;

// Semana da cadência (1-based) desde o 1º contato. D0-6 = semana 1, etc.
export function semanaCadencia(primeiroContatoEm: Date, agora: Date): number {
  const dias = Math.floor((agora.getTime() - primeiroContatoEm.getTime()) / MS_DIA);
  if (dias < 0) return 1;
  return Math.floor(dias / 7) + 1;
}

// Fase ESPERADA pela cadência (por tempo). Semana 1=Abordagem, 2=Qualificação,
// 3=Proposta, 4=Fechamento, >=5=Nutrição (fim da cadência sem avanço).
export function faseEsperada(primeiroContatoEm: Date, agora: Date): FaseCadencia {
  const s = semanaCadencia(primeiroContatoEm, agora);
  if (s <= 1) return "ABORDAGEM";
  if (s === 2) return "QUALIFICACAO";
  if (s === 3) return "PROPOSTA";
  if (s === 4) return "FECHAMENTO";
  return "NUTRICAO";
}

// "Sem resposta" só depois de no mínimo 5 tentativas em pelo menos 2 canais
// (Manual Fase 2). Protege contra encerrar cedo demais.
export function podeEncerrarSemResposta(
  tentativas: number,
  canaisDistintos: number,
): boolean {
  return tentativas >= 5 && canaisDistintos >= 2;
}

// Data em que um contato em NUTRICAO volta a ser abordável (hoje + 90 dias).
export function nutricaoVoltaEm(agora: Date, dias = 90): Date {
  return new Date(agora.getTime() + dias * MS_DIA);
}

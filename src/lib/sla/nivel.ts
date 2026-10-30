// Nivel de marcacao de SLA de um negocio, puro (sem banco/rede) — base testavel
// do motor slaAlertas. decorridoMin = tempo na etapa; limiarMin = prazo da etapa
// (ja com o dobro B2B aplicado pelo chamador). margemAmareloMin = antecedencia do
// aviso amarelo (12h). A unidade (minutos uteis vs corridos) e do chamador: aqui
// so se comparam numeros. VIP e tratado ANTES (nunca chega aqui).
//
//   decorrido >= limiar            -> VERMELHO (prazo vencido / atraso)
//   limiar - margem <= decorrido    -> AMARELO  (prazo vencendo)
//   decorrido < limiar - margem     -> null     (dentro do prazo, sem marcacao)
//
// A janela AMARELA fica nos ultimos `margem` minutos (12h por padrao), MAS nunca
// cobre mais que METADE do prazo da etapa. Sem esse teto, um card recem-entrado
// numa etapa de prazo CURTO (ex.: 1 dia util = 540min = 9h < 12h) ja nasceria
// amarelo mesmo DENTRO do periodo — o bug que o Luccas reportou. Com o teto,
// sempre ha uma fase inicial SEM COR (confortavelmente dentro do prazo), e o
// amarelo so aparece quando o card ja passou da metade E esta a <=12h de vencer.
export type NivelSla = "AMARELO" | "VERMELHO";

export const MARGEM_AMARELO_MIN = 12 * 60; // 12 horas

export function nivelSla(
  decorridoMin: number,
  limiarMin: number,
  margemAmareloMin: number = MARGEM_AMARELO_MIN,
): NivelSla | null {
  if (!(limiarMin > 0)) return null;
  if (decorridoMin >= limiarMin) return "VERMELHO";
  // Teto: a janela amarela nao passa de metade do prazo (evita amarelo no inicio).
  const margem = Math.min(margemAmareloMin, Math.floor(limiarMin / 2));
  if (decorridoMin >= limiarMin - margem) return "AMARELO";
  return null;
}

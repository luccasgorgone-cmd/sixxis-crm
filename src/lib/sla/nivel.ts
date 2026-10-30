// Nivel de marcacao de SLA de um negocio, puro (sem banco/rede) — base testavel
// do motor slaAlertas. decorridoMin = tempo na etapa; limiarMin = prazo da etapa
// (ja com o dobro B2B aplicado pelo chamador). margemAmareloMin = antecedencia do
// aviso amarelo (12h). A unidade (minutos uteis vs corridos) e do chamador: aqui
// so se comparam numeros. VIP e tratado ANTES (nunca chega aqui).
//
//   decorrido >= limiar                      -> VERMELHO (prazo vencido / atraso)
//   limiar - margem <= decorrido < limiar    -> AMARELO  (prazo vencendo, ~12h)
//   decorrido < limiar - margem              -> null     (sem marcacao)
//
// Etapa de prazo curto (limiar <= margem): a janela amarela vira [0, limiar), ou
// seja, o card ja nasce amarelo e vira vermelho ao estourar — aceitavel.
export type NivelSla = "AMARELO" | "VERMELHO";

export const MARGEM_AMARELO_MIN = 12 * 60; // 12 horas

export function nivelSla(
  decorridoMin: number,
  limiarMin: number,
  margemAmareloMin: number = MARGEM_AMARELO_MIN,
): NivelSla | null {
  if (!(limiarMin > 0)) return null;
  if (decorridoMin >= limiarMin) return "VERMELHO";
  if (decorridoMin >= limiarMin - margemAmareloMin) return "AMARELO";
  return null;
}

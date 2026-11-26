// Regra UNICA da trava de conversao externa.
//
// SO VENDA NOVA (aquisicao) vira conversao externa: Purchase no Meta (CAPI) e
// conversao offline no Google. Pos-venda, assistencia, troca e qualquer
// finalidade != VENDA ficam de fora — nao sao aquisicao de cliente novo e, se
// enviadas, inflam o retorno das campanhas e envenenam a otimizacao do anuncio.
//
// Mantida num unico lugar para os dois lanes (route.ts = Meta CAPI;
// googleOffline.ts = Google offline) nao divergirem.

import { Prisma } from "@/generated/prisma/client";
import { Finalidade, StatusNeg } from "@/generated/prisma/enums";

/**
 * True SOMENTE para VENDA NOVA — o unico caso elegivel a conversao externa.
 * POS_VENDA (e qualquer outra finalidade) retorna false.
 */
export function ehFinalidadeDeConversao(finalidade: Finalidade): boolean {
  return finalidade === Finalidade.VENDA;
}

/**
 * `where` dos negocios GANHOS elegiveis ao CSV de conversao offline do Google.
 * Inclui a trava de finalidade (SO VENDA) alem dos filtros historicos
 * (status GANHO, valor oficial>0, lead com googleClickId).
 */
export function whereGanhosGoogleOffline(): Prisma.NegocioWhereInput {
  return {
    finalidade: Finalidade.VENDA,
    status: StatusNeg.GANHO,
    OR: [
      { valorAjustado: { gt: 0 } },
      { valorAjustado: null, valor: { gt: 0 } },
    ],
    lead: { googleClickId: { not: null } },
  };
}

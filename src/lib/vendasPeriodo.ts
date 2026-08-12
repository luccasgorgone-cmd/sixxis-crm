// FONTE UNICA de "quais negocios foram VENDIDOS no periodo" (Fatia 14).
//
// O PROBLEMA QUE ISTO RESOLVE: quando o cliente ja vendido volta a mandar
// mensagem, garantirNegocioParaLead reabre o negocio (GANHO -> ABERTO) para o
// atendimento acontecer — e nessa reabertura o fechadoEm e ZERADO. Como
// carteira, metas, dashboard e oracle contavam faturamento por
// "status = GANHO agora E fechadoEm no periodo", a venda perdia as DUAS pontas
// do criterio de uma vez e simplesmente sumia do numero. A venda, porem,
// aconteceu: e um fato do passado.
//
// A VACINA: contar por "HOUVE ganho cuja data cai no periodo", nao por "esta
// ganho agora". A data do ganho sobrevive a reabertura em ultimoGanhoEm (nunca
// limpo) e no evento GANHO do HistoricoNegocio (nunca apagado).
//
// TRES FONTES, UNIDAS — e a uniao e proposital:
//   1) status GANHO + fechadoEm no periodo ......... a REGRA ANTIGA, inteira;
//   2) ultimoGanhoEm no periodo .................... a memoria do ganho, que
//      sobrevive a reabertura. E a fonte principal;
//   3) evento GANHO valido no historico no periodo .. a prova documental, para
//      ganhos antigos anteriores a ultimoGanhoEm existir.
//
// A regra nova CONTEM a antiga (item 1). Isso e a garantia de que esta fatia
// nao pode fazer nenhuma venda que hoje conta PARAR de contar: no maximo entram
// mais. Faturamento so anda para cima aqui, e cada real a mais tem um ganho
// datado atras dele.
//
// NAO CONTA EM DOBRO: o filtro e sobre o NEGOCIO, entao cada negocio entra uma
// vez, casando por uma fonte ou por tres. Isso tambem torna inofensivos os
// ganhos repetidos que a Fatia 9 neutraliza — quatro eventos de ganho no mesmo
// negocio continuam sendo UM negocio vendido. Ainda assim, a fonte 3 ignora os
// eventos marcados como duplicados de movimentacao: repeticao de card nao e
// venda, e nao pode sozinha colocar um negocio no faturamento.
//
// NOTA SOBRE GRANULARIDADE: aqui a unidade e o NEGOCIO (uma venda por negocio,
// valor = Negocio.valor), como carteira e metas sempre contaram. O historico de
// compras (lib/compras) conta EVENTOS, entao um cliente que comprou duas vezes
// no mesmo negocio aparece com 2 compras la e 1 venda aqui. Os dois estao
// certos, medindo coisas diferentes; o que os dois compartilham e a nocao de
// ganho VALIDO (sem os duplicados de movimentacao).
import type { Prisma } from "../generated/prisma/client";
import { StatusNeg, TipoHistorico } from "../generated/prisma/enums";
import { SUFIXO_GANHO_DUPLICADO } from "./compras";

export type JanelaVenda = { inicio: Date; fim: Date };

// Fragmento de WHERE (Negocio) para "vendido no periodo". Fragmento, e nao uma
// funcao que busca, de proposito: assim cada chamador continua fazendo o SEU
// count/sum/findMany no banco, com o SEU escopo (dono, finalidade, agente), sem
// carregar negocio nenhum para a memoria. Trocar a regra vira uma linha em cada
// ponto, e a regra mora aqui.
//
// Combine com o escopo por AND, NUNCA espalhando no mesmo objeto: este
// fragmento usa OR, e um segundo OR no mesmo nivel sobrescreveria o primeiro.
// Use `where: { AND: [escopo, whereVendaNoPeriodo(j)] }`.
export function whereVendaNoPeriodo(j: JanelaVenda): Prisma.NegocioWhereInput {
  return {
    OR: [
      // 1) Regra antiga, preservada inteira.
      {
        status: StatusNeg.GANHO,
        fechadoEm: { gte: j.inicio, lte: j.fim },
      },
      // 2) Memoria do ganho — sobrevive a reabertura no pos-venda.
      { ultimoGanhoEm: { gte: j.inicio, lte: j.fim } },
      // 3) Prova documental, para o que e anterior a memoria existir.
      {
        historicos: {
          some: {
            tipo: TipoHistorico.GANHO,
            criadoEm: { gte: j.inicio, lte: j.fim },
            NOT: { descricao: { endsWith: SUFIXO_GANHO_DUPLICADO } },
          },
        },
      },
    ],
  };
}

// A REGRA ANTIGA sozinha. Existe para a previa comparativa poder medir as duas
// lado a lado sem reescrever o criterio velho na mao (e correr o risco de
// comparar contra algo que nunca rodou).
export function whereVendaNoPeriodoAntigo(
  j: JanelaVenda,
): Prisma.NegocioWhereInput {
  return {
    status: StatusNeg.GANHO,
    fechadoEm: { gte: j.inicio, lte: j.fim },
  };
}

// Junta escopo + janela sem risco de um OR comer o outro.
export function comEscopo(
  escopo: Prisma.NegocioWhereInput,
  janela: Prisma.NegocioWhereInput,
): Prisma.NegocioWhereInput {
  return { AND: [escopo, janela] };
}

// A DATA DA VENDA de um negocio, na mesma ordem de confianca das fontes acima.
// Usada por quem precisa exibir/ordenar/agrupar por dia — nao para filtrar (o
// filtro e o WHERE, que roda no banco).
//
// ultimoGanhoEm vem primeiro porque e o unico que sobrevive a reabertura:
// fechadoEm de um negocio reaberto e null, e usa-lo daria a data errada (ou
// nenhuma) justamente nos casos que esta fatia veio consertar.
export function dataDaVenda(n: {
  ultimoGanhoEm?: Date | null;
  fechadoEm?: Date | null;
  ganhoHistoricoEm?: Date | null;
}): Date | null {
  return n.ultimoGanhoEm ?? n.fechadoEm ?? n.ganhoHistoricoEm ?? null;
}

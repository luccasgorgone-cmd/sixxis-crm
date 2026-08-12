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
// NAO CONTA EM DOBRO — e ha DOIS tipos de duplicado a barrar, que e onde a
// primeira versao desta regra errou:
//
//   a) DUPLICADO DE MOVIMENTACAO (Fatia 9): varios eventos GANHO no MESMO
//      negocio, de mover o card ganho -> reaberto -> ganho. Inofensivo por
//      construcao, porque o filtro e sobre o NEGOCIO: quatro eventos continuam
//      sendo um negocio vendido. A fonte 3 ainda assim ignora os marcados, para
//      repeticao de card nunca colocar sozinha um negocio no faturamento.
//
//   b) DUPLICADO DE NEGOCIO (corrigir-duplicados): DOIS negocios do mesmo
//      cliente para a mesma venda. O perdedor vira PERDIDO com o marcador de
//      neutralizado, mas guarda o ganho antigo no historico — entao as fontes 2
//      e 3 o traziam de volta, somando a MESMA venda junto com o negocio que
//      ficou GANHO. Era dobra real no faturamento, achada em auditoria. Agora as
//      duas fontes novas descartam o neutralizado (ver lib/motivosPerda), que e
//      a mesma exclusao que lib/compras e lib/perdidos ja faziam.
//
// A fonte 1 (regra antiga) NAO leva nenhum desses filtros, de proposito: e ela
// que garante o superconjunto, e um filtro novo ali poderia derrubar algo que
// hoje conta. Na pratica um neutralizado nunca casa com ela — esta PERDIDO.
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
import { WHERE_NAO_DUPLICADO_NEUTRALIZADO } from "./motivosPerda";

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
      // 1) Regra antiga, preservada INTEIRA e sem nenhum filtro extra. E ela que
      //    garante o superconjunto: nada que contava antes pode deixar de
      //    contar por causa de um filtro novo posto aqui.
      {
        status: StatusNeg.GANHO,
        fechadoEm: { gte: j.inicio, lte: j.fim },
      },
      // 2) Memoria do ganho — sobrevive a reabertura no pos-venda.
      {
        AND: [
          { ultimoGanhoEm: { gte: j.inicio, lte: j.fim } },
          WHERE_NAO_DUPLICADO_NEUTRALIZADO,
        ],
      },
      // 3) Prova documental, para o que e anterior a memoria existir.
      {
        AND: [
          {
            historicos: {
              some: {
                tipo: TipoHistorico.GANHO,
                criadoEm: { gte: j.inicio, lte: j.fim },
                // Ganho repetido por movimentacao do card nao e venda: ele e a
                // MESMA venda contada duas vezes, e descartar e correcao, nao
                // julgamento. Hoje este e o unico motivo pelo qual um ganho para
                // de valer (o mesmo que WHERE_GANHO_VALIDO em lib/compras usa).
                NOT: { descricao: { endsWith: SUFIXO_GANHO_DUPLICADO } },
              },
            },
          },
          WHERE_NAO_DUPLICADO_NEUTRALIZADO,
        ],
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

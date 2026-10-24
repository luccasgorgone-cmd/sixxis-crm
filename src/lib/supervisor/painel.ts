// Camada 1 — montarPainel: a FORMA ÚNICA (§4) consumida tanto pela UI quanto
// pelo contexto da IA. Agrega métricas existentes (metricas/perdidos) + os
// indicadores novos (indicadores.ts). Números nascem aqui; o LLM só lê.
import { prisma } from "../prisma";
import { StatusNeg } from "../../generated/prisma/enums";
import type { Finalidade } from "../../generated/prisma/enums";
import { calcularMetricas } from "../metricas";
import type { Metricas } from "../metricas";
import { analisarPerdidosWhere } from "../perdidos";
import { whereVendaNoPeriodo, comEscopo } from "../vendasPeriodo";
import type { Prisma } from "../../generated/prisma/client";
import {
  chaveSla,
  coberturaFunil,
  coreCobertura,
  coreFunil,
  coreParados,
  ganhosPerdasPorOrigem,
  pctDentroDoPrazo1aResposta,
  semProximoPasso,
  valorEfetivo,
} from "./indicadores";
import {
  avaliarSemaforo,
  IND,
  type EscopoSupervisor,
  type Indicador,
  type Janela,
  type LinhaRanking,
  type PainelSupervisor,
  type SupervisorLimiares,
} from "./tipos";

function escopoNegocioWhere(e: EscopoSupervisor): Prisma.NegocioWhereInput {
  const w: Prisma.NegocioWhereInput = {};
  if (e.agenteId) w.agenteId = e.agenteId;
  if (e.finalidade) w.finalidade = e.finalidade;
  return w;
}

// Monta um cartão de indicador resolvendo o semáforo pelos cortes configurados.
function card(
  chave: string,
  titulo: string,
  valor: number | null,
  unidade: Indicador["unidade"],
  maiorMelhor: boolean,
  limiares: SupervisorLimiares,
  detalhe?: string,
): Indicador {
  const cortes = limiares.metas[chave];
  return {
    chave,
    titulo,
    valor,
    unidade,
    meta: cortes ? cortes.verde : null,
    semaforo: avaliarSemaforo(valor, cortes, maiorMelhor),
    maiorMelhor,
    detalhe,
  };
}

// Ranking por vendedor: reusa calcularMetricas por agenteId + os dois
// indicadores novos mais baratos (1ª resposta no prazo e sem próximo passo).
async function montarRanking(
  janela: Janela,
  finalidade: Finalidade | null,
  limiares: SupervisorLimiares,
): Promise<LinhaRanking[]> {
  const agentes = await prisma.agente.findMany({
    where: {
      ativo: true,
      ...(finalidade === "VENDA"
        ? { acessoVenda: true }
        : finalidade === "POS_VENDA"
          ? { acessoPosVenda: true }
          : {}),
    },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  const linhas = await Promise.all(
    agentes.map(async (a): Promise<LinhaRanking> => {
      const e: EscopoSupervisor = {
        agenteId: a.id,
        finalidade: finalidade ?? undefined,
      };
      const [m, prazo, semProx] = await Promise.all([
        calcularMetricas(janela, e),
        pctDentroDoPrazo1aResposta(janela, limiares.prazo1aRespostaSeg, e),
        semProximoPasso(e),
      ]);
      return {
        agenteId: a.id,
        nome: a.nome,
        ganhos: m.ganhos,
        perdidos: m.perdidos,
        valorVendido: m.valorVendido,
        conversao: m.conversao,
        tempoPrimeiraRespostaSeg: m.tempoPrimeiraRespostaSeg,
        pctDentroDoPrazo: prazo.pct,
        semProximoPasso: semProx.semProximo,
      };
    }),
  );

  // Mais vendedor primeiro: valor vendido, depois ganhos.
  return linhas.sort(
    (a, b) => b.valorVendido - a.valorVendido || b.ganhos - a.ganhos,
  );
}

export async function montarPainel(
  janela: Janela,
  finalidade: Finalidade | null,
  limiares: SupervisorLimiares,
  escopo: { agenteId?: string } = {},
  agora: Date = new Date(),
): Promise<PainelSupervisor> {
  const e: EscopoSupervisor = {
    finalidade: finalidade ?? undefined,
    agenteId: escopo.agenteId,
  };

  // Snapshot único dos ABERTO do escopo — alimenta funil, cobertura e parados
  // sem três varreduras separadas.
  const abertos = await prisma.negocio.findMany({
    where: { AND: [escopoNegocioWhere(e), { status: StatusNeg.ABERTO }] },
    select: {
      etapaId: true,
      entrouEtapaEm: true,
      finalidade: true,
      valor: true,
      valorAjustado: true,
      temperatura: true,
    },
  });

  // Etapas ABERTAS da finalidade (ou todas) — nomes/ordem para funil e parados.
  const etapas = await prisma.etapa.findMany({
    where: {
      ativo: true,
      tipo: "ABERTA",
      ...(finalidade ? { finalidade: { in: [finalidade, "AMBAS"] } } : {}),
    },
    select: { id: true, nome: true, ordem: true },
    orderBy: { ordem: "asc" },
  });

  // Ganhos e perdas do período com origem, para o rollup por origem.
  const baseEscopo = escopoNegocioWhere(e);
  const [metricas, perdas, pctPrazo, semProx, ganhosRaw, perdasRaw, ranking] =
    await Promise.all([
      calcularMetricas(janela, e),
      analisarPerdidosWhere(baseEscopo, {
        inicio: janela.inicio,
        fim: janela.fim,
      }),
      pctDentroDoPrazo1aResposta(janela, limiares.prazo1aRespostaSeg, e),
      semProximoPasso(e, agora),
      prisma.negocio.findMany({
        where: comEscopo(baseEscopo, whereVendaNoPeriodo(janela)),
        select: {
          valor: true,
          valorAjustado: true,
          lead: { select: { origem: true, anuncioTitulo: true } },
        },
      }),
      prisma.negocio.findMany({
        where: {
          AND: [
            baseEscopo,
            {
              status: StatusNeg.PERDIDO,
              // `lt` no fim (não `lte`) para casar exatamente com a fronteira de
              // wherePerdidos em metricas.ts — assim origens/perdas reconciliam
              // com metricas.perdidos também na borda do período.
              fechadoEm: { gte: janela.inicio, lt: janela.fim },
            },
            { NOT: whereVendaNoPeriodo(janela) },
          ],
        },
        select: { lead: { select: { origem: true, anuncioTitulo: true } } },
      }),
      montarRanking(janela, finalidade, limiares),
    ]);

  // Limiares de SLA por (finalidade, etapa) — MESMA fonte que a varredura usa
  // para "parado" (ConfigAlertaSla). Onde não houver, cai no paradoDiasPadrao.
  const slasAtivos = await prisma.configAlertaSla
    .findMany({ where: { ativo: true }, select: { finalidade: true, etapaId: true, minutosParaAlerta: true } })
    .catch(() => []);
  const slaMin = new Map(
    slasAtivos.map((s) => [chaveSla(s.finalidade, s.etapaId), s.minutosParaAlerta]),
  );

  const funil = coreFunil(etapas, abertos, agora);
  const parados = coreParados(etapas, abertos, limiares.paradoDiasPadrao, agora, slaMin);

  const metaRestante =
    limiares.metaPeriodoReais !== null
      ? Math.max(0, limiares.metaPeriodoReais - metricas.valorVendido)
      : null;
  const cobertura = coreCobertura(
    abertos.map((n) => ({
      valor: valorEfetivo(n.valor, n.valorAjustado),
      temperatura: n.temperatura,
    })),
    limiares.pesosCobertura,
    metaRestante,
  );

  const origens = await ganhosPerdasPorOrigem(
    ganhosRaw.map((n) => ({
      origem: n.lead?.origem ?? null,
      anuncioTitulo: n.lead?.anuncioTitulo ?? null,
      valor: valorEfetivo(n.valor, n.valorAjustado),
    })),
    perdasRaw.map((n) => ({
      origem: n.lead?.origem ?? null,
      anuncioTitulo: n.lead?.anuncioTitulo ?? null,
    })),
  );

  const indicadores: Indicador[] = [
    card(
      IND.PCT_PRAZO,
      "1ª resposta no prazo",
      pctPrazo.pct,
      "pct",
      true,
      limiares,
      `${pctPrazo.dentro}/${pctPrazo.total} conversas`,
    ),
    card(IND.CONVERSAO, "Conversão", metricas.conversao, "pct", true, limiares, `${metricas.ganhos}/${metricas.finalizados} finalizados`),
    card(
      IND.COBERTURA,
      "Cobertura de funil",
      cobertura.cobertura,
      "x",
      true,
      limiares,
      metaRestante !== null
        ? `R$ ${Math.round(cobertura.ponderadoReais)} ponderado / R$ ${Math.round(metaRestante)} restante`
        : "sem meta configurada",
    ),
    card(
      IND.SEM_PROXIMO,
      "Sem próximo passo",
      semProx.pct,
      "pct",
      false,
      limiares,
      `${semProx.semProximo}/${semProx.totalAbertos} abertos`,
    ),
    card(
      IND.TEMPO_1A_RESP,
      "Tempo de 1ª resposta",
      metricas.tempoPrimeiraRespostaSeg || null,
      "seg",
      false,
      limiares,
    ),
    card(
      IND.MEDIANA_1A_RESP,
      "Mediana da 1ª resposta",
      metricas.medianaPrimeiraRespostaSeg || null,
      "seg",
      false,
      limiares,
    ),
    card(
      IND.PCT_15MIN,
      "1º contato em até 15 min",
      metricas.pctPrimeiraRespostaAte15min,
      "pct",
      true,
      limiares,
    ),
    card(
      IND.MOTIVO_PREENCHIDO,
      "Motivo de perda preenchido",
      metricas.pctMotivoPreenchido,
      "pct",
      true,
      limiares,
      `${metricas.perdidos} perdas no período`,
    ),
    card(
      IND.CICLO_GANHO,
      "Ciclo de venda (Novo→Ganho)",
      metricas.cicloGanhoDias || null,
      "dias",
      false,
      limiares,
    ),
    card(
      IND.TICKET,
      "Ticket médio",
      metricas.ticketMedio || null,
      "reais",
      true,
      limiares,
    ),
  ];

  return {
    janela: { inicio: janela.inicio.toISOString(), fim: janela.fim.toISOString() },
    finalidade,
    geradoEm: agora.toISOString(),
    metricas: metricas satisfies Metricas,
    indicadores,
    funil,
    semProximoPasso: semProx,
    cobertura,
    pctDentroDoPrazo: pctPrazo,
    perdas,
    parados,
    origens,
    ranking,
    limiares,
  };
}

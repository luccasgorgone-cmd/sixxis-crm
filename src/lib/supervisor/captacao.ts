// Captação Ativa — mede prospecção ativa por vendedor (clientes cadastrados
// MANUALMENTE: Lead.origem="manual") por período. Conversão e R$ por COORTE:
// dos captados na janela, seguimos os negócios pra frente sem filtrar data de
// fechamento. Ver docs/DESIGN_CAPTACAO_ATIVA.md.
//
// Este arquivo tem duas partes: (1) agregarCaptacao — PURO, testável sem banco
// (contrato c9); (2) coletarCaptacao — a query Prisma (Task 2) que monta as
// linhas e chama o agregador.

import { prisma } from "../prisma";
import {
  AtividadeTipo,
  StatusNeg,
  TipoHistorico,
} from "../../generated/prisma/enums";
import type { Finalidade } from "../../generated/prisma/enums";
import type { Prisma } from "../../generated/prisma/client";
import { valorEfetivo } from "./indicadores";

const ROTULO_SEM_VENDEDOR = "(sem vendedor)";

export type StatusCaptacao = "ABERTO" | "GANHO" | "PERDIDO";

export type LinhaCaptacao = {
  leadId: string;
  nome: string | null;
  telefone: string;
  donoId: string | null;
  donoNome: string | null;
  cadastradoPorId: string | null;
  cadastradoPorNome: string | null;
  criadoEm: Date;
  etapaAtual: string | null;
  status: StatusCaptacao | null;
  valorGanho: number | null;
};

export type RankingVendedorCaptacao = {
  agenteId: string | null;
  nome: string | null;
  captados: number;
  convertidos: number;
  conversao: number;
  valorGerado: number;
};

export type PontoSerie = { data: string; captados: number };

export type TotaisCaptacao = {
  total: number;
  conversao: number;
  valorGerado: number;
};

export type ResultadoCaptacao = {
  total: number;
  vendedoresQueCaptaram: number;
  convertidos: number;
  conversao: number;
  valorGerado: number;
  delta: {
    total: number | null;
    conversao: number | null;
    valorGerado: number | null;
  };
  ranking: RankingVendedorCaptacao[];
  serie: PontoSerie[];
  linhas: LinhaCaptacao[];
};

// Fração de variação vs. período anterior; null quando o anterior é 0 (não há
// base de comparação — evita divisão por zero e "+Infinity%").
function delta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (atual - anterior) / anterior;
}

function diaSP(data: Date, fuso: string): string {
  // en-CA formata como YYYY-MM-DD; timeZone garante o dia no fuso certo.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

export function agregarCaptacao(
  linhas: LinhaCaptacao[],
  totalAnterior: TotaisCaptacao,
  fuso = "America/Sao_Paulo",
): ResultadoCaptacao {
  const total = linhas.length;
  const convertidos = linhas.filter((l) => l.status === "GANHO").length;
  const valorGerado = linhas.reduce(
    (s, l) => s + (l.status === "GANHO" ? l.valorGanho ?? 0 : 0),
    0,
  );
  const conversao = total === 0 ? 0 : convertidos / total;

  // Ranking por dono (null -> bucket "(sem vendedor)").
  const porDono = new Map<string | null, RankingVendedorCaptacao>();
  for (const l of linhas) {
    const chave = l.donoId;
    let r = porDono.get(chave);
    if (!r) {
      r = {
        agenteId: chave,
        nome: chave === null ? ROTULO_SEM_VENDEDOR : l.donoNome,
        captados: 0,
        convertidos: 0,
        conversao: 0,
        valorGerado: 0,
      };
      porDono.set(chave, r);
    }
    r.captados += 1;
    if (l.status === "GANHO") {
      r.convertidos += 1;
      r.valorGerado += l.valorGanho ?? 0;
    }
  }
  const ranking = [...porDono.values()]
    .map((r) => ({ ...r, conversao: r.captados === 0 ? 0 : r.convertidos / r.captados }))
    .sort((a, b) => b.captados - a.captados);

  // "Vendedores que captaram" = buckets de dono real (exclui "(sem vendedor)").
  const vendedoresQueCaptaram = ranking.filter((r) => r.agenteId !== null).length;

  // Série por dia (fuso SP), ordenada.
  const porDia = new Map<string, number>();
  for (const l of linhas) {
    const d = diaSP(l.criadoEm, fuso);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  const serie: PontoSerie[] = [...porDia.entries()]
    .map(([data, captados]) => ({ data, captados }))
    .sort((a, b) => a.data.localeCompare(b.data));

  return {
    total,
    vendedoresQueCaptaram,
    convertidos,
    conversao,
    valorGerado,
    delta: {
      total: delta(total, totalAnterior.total),
      conversao: delta(conversao, totalAnterior.conversao),
      valorGerado: delta(valorGerado, totalAnterior.valorGerado),
    },
    ranking,
    serie,
    linhas,
  };
}

// ---------------------------------------------------------------------------
// Query (Task 2): monta as LinhaCaptacao da janela e chama o agregador puro.
// COORTE: captados = Lead.origem="manual" com criadoEm na janela; conversão/R$
// seguem os negócios do lead PRA FRENTE (qualquer evento GANHO no histórico),
// sem filtrar data de fechamento. "Cadastrado por" = Atividade(CRIACAO) com
// agenteId (as ingestões anúncio/google-ads criam CRIACAO sem agenteId).
// ---------------------------------------------------------------------------

export type ArgsCaptacao = {
  janela: { inicio: Date; fim: Date };
  finalidade: Finalidade | null;
  agenteId?: string | null;
};

async function montarLinhas(
  janela: { inicio: Date; fim: Date },
  finalidade: Finalidade | null,
  agenteId: string | null,
): Promise<LinhaCaptacao[]> {
  const where: Prisma.LeadWhereInput = {
    origem: "manual",
    criadoEm: { gte: janela.inicio, lt: janela.fim },
    ...(finalidade === "VENDA" ? { donoId: agenteId ?? { not: null } } : {}),
    ...(finalidade === "POS_VENDA"
      ? { donoPosVendaId: agenteId ?? { not: null } }
      : {}),
    ...(!finalidade && agenteId
      ? { OR: [{ donoId: agenteId }, { donoPosVendaId: agenteId }] }
      : {}),
  };

  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      nome: true,
      nomeManual: true,
      pushName: true,
      telefone: true,
      criadoEm: true,
      dono: { select: { id: true, nome: true } },
      donoPosVenda: { select: { id: true, nome: true } },
      atividades: {
        where: { tipo: AtividadeTipo.CRIACAO, agenteId: { not: null } },
        orderBy: { criadoEm: "asc" },
        take: 1,
        select: { agente: { select: { id: true, nome: true } } },
      },
      negocios: {
        where: finalidade ? { finalidade } : undefined,
        select: {
          status: true,
          valor: true,
          valorAjustado: true,
          etapa: { select: { nome: true } },
          historicos: {
            where: { tipo: TipoHistorico.GANHO },
            select: { valorGanho: true },
          },
        },
      },
    },
  });

  return leads.map((l) => {
    const porFin =
      finalidade === "POS_VENDA"
        ? l.donoPosVenda
        : finalidade === "VENDA"
          ? l.dono
          : (l.dono ?? l.donoPosVenda);
    const cad = l.atividades[0]?.agente ?? null;

    const ganhoHist = l.negocios.flatMap((n) => n.historicos);
    const converteu = ganhoHist.length > 0;
    let valorGanho: number | null = null;
    if (converteu) {
      let soma = ganhoHist.reduce((s, h) => s + Number(h.valorGanho ?? 0), 0);
      if (soma === 0) {
        // Eventos GANHO antigos sem valorGanho estruturado: cai no valorEfetivo.
        soma = l.negocios
          .filter((n) => n.historicos.length > 0)
          .reduce((s, n) => s + valorEfetivo(n.valor, n.valorAjustado), 0);
      }
      valorGanho = soma;
    }

    const principal = l.negocios[0] ?? null;
    const status: StatusCaptacao = converteu
      ? "GANHO"
      : principal?.status === StatusNeg.PERDIDO
        ? "PERDIDO"
        : "ABERTO";

    return {
      leadId: l.id,
      nome: l.nomeManual ?? l.pushName ?? l.nome ?? null,
      telefone: l.telefone,
      donoId: porFin?.id ?? null,
      donoNome: porFin?.nome ?? null,
      cadastradoPorId: cad?.id ?? null,
      cadastradoPorNome: cad?.nome ?? null,
      criadoEm: l.criadoEm,
      etapaAtual: principal?.etapa?.nome ?? null,
      status,
      valorGanho,
    };
  });
}

export async function coletarCaptacao(
  args: ArgsCaptacao,
): Promise<ResultadoCaptacao> {
  const { janela, finalidade } = args;
  const agenteId = args.agenteId ?? null;

  const linhas = await montarLinhas(janela, finalidade, agenteId);

  // Janela anterior de mesma duração — só os 3 totais, para o delta ▲/▼.
  const dur = janela.fim.getTime() - janela.inicio.getTime();
  const janelaAnterior = {
    inicio: new Date(janela.inicio.getTime() - dur),
    fim: janela.inicio,
  };
  const linhasAnt = await montarLinhas(janelaAnterior, finalidade, agenteId);
  const agAnt = agregarCaptacao(linhasAnt, {
    total: 0,
    conversao: 0,
    valorGerado: 0,
  });

  return agregarCaptacao(linhas, {
    total: agAnt.total,
    conversao: agAnt.conversao,
    valorGerado: agAnt.valorGerado,
  });
}

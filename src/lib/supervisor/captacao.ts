// Captação Ativa — mede prospecção ativa por vendedor (clientes cadastrados
// MANUALMENTE: Lead.origem="manual") por período. Conversão e R$ por COORTE:
// dos captados na janela, seguimos os negócios pra frente sem filtrar data de
// fechamento. Ver docs/DESIGN_CAPTACAO_ATIVA.md.
//
// Este arquivo tem duas partes: (1) agregarCaptacao — PURO, testável sem banco
// (contrato c9); (2) coletarCaptacao — a query Prisma (Task 2) que monta as
// linhas e chama o agregador.

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

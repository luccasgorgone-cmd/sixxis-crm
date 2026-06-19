// Agregacoes de metricas para os dashboards (colaborador e admin).
// Escopo opcional por agenteId e/ou finalidade. Periodo obrigatorio.
import { prisma } from "./prisma";
import { Prisma } from "../generated/prisma/client";
import { StatusNeg, Finalidade } from "../generated/prisma/enums";

export type Periodo = { inicio: Date; fim: Date };

// Resolve um preset (?periodo=) ou um intervalo explicito (?inicio&fim).
export function resolverPeriodo(
  preset: string | null,
  inicioStr: string | null,
  fimStr: string | null,
  agora: Date,
): Periodo {
  if (inicioStr && fimStr) {
    const inicio = new Date(inicioStr);
    const fim = new Date(fimStr);
    if (!Number.isNaN(inicio.getTime()) && !Number.isNaN(fim.getTime())) {
      return { inicio, fim };
    }
  }
  const fim = agora;
  const inicio = new Date(agora);
  switch (preset) {
    case "hoje":
      inicio.setHours(0, 0, 0, 0);
      break;
    case "semana":
      inicio.setDate(inicio.getDate() - 7);
      break;
    case "15d":
      inicio.setDate(inicio.getDate() - 15);
      break;
    case "mes":
    default:
      inicio.setDate(inicio.getDate() - 30);
      break;
  }
  return { inicio, fim };
}

type Escopo = { agenteId?: string; finalidade?: Finalidade };

export type Metricas = {
  clientesAtendidos: number;
  abertos: number;
  pendentes: number;
  finalizados: number;
  ganhos: number;
  perdidos: number;
  conversao: number; // 0..1
  valorVendido: number;
  ticketMedio: number;
  msgEnviadas: number;
  msgRecebidas: number;
  tempoPrimeiraRespostaSeg: number; // media
  tempoResolucaoSeg: number; // media
};

function negocioWhere(
  p: Periodo,
  e: Escopo,
  status?: StatusNeg[],
  porFechamento = false,
): Prisma.NegocioWhereInput {
  const w: Prisma.NegocioWhereInput = {};
  if (e.agenteId) w.agenteId = e.agenteId;
  if (e.finalidade) w.finalidade = e.finalidade;
  if (status) w.status = { in: status };
  if (porFechamento) w.fechadoEm = { gte: p.inicio, lt: p.fim };
  return w;
}

// Fragmentos SQL opcionais para os calculos de tempo medio.
function condConversa(e: Escopo) {
  const partes: Prisma.Sql[] = [];
  if (e.agenteId) partes.push(Prisma.sql`AND c."agenteId" = ${e.agenteId}`);
  if (e.finalidade) {
    partes.push(Prisma.sql`AND c."finalidade" = ${e.finalidade}::"Finalidade"`);
  }
  return partes.length ? Prisma.join(partes, " ") : Prisma.empty;
}

export async function calcularMetricas(
  p: Periodo,
  e: Escopo,
): Promise<Metricas> {
  const limite24h = new Date(p.fim.getTime() - 24 * 60 * 60 * 1000);

  const [
    abertos,
    finalizados,
    ganhos,
    somaValor,
    pendentes,
    msgEnviadas,
    msgRecebidas,
    clientesRaw,
    primeiraRespRaw,
    resolucaoRaw,
  ] = await Promise.all([
    prisma.negocio.count({
      where: negocioWhere(p, e, [StatusNeg.ABERTO]),
    }),
    prisma.negocio.count({
      where: negocioWhere(p, e, [StatusNeg.GANHO, StatusNeg.PERDIDO], true),
    }),
    prisma.negocio.count({
      where: negocioWhere(p, e, [StatusNeg.GANHO], true),
    }),
    prisma.negocio.aggregate({
      _sum: { valor: true },
      where: negocioWhere(p, e, [StatusNeg.GANHO], true),
    }),
    // Pendentes: conversa aberta com cliente aguardando (nao lidas>0) ou sem
    // resposta ha mais de 24h.
    prisma.conversa.count({
      where: {
        ...(e.agenteId ? { agenteId: e.agenteId } : {}),
        ...(e.finalidade ? { finalidade: e.finalidade } : {}),
        status: "aberta",
        OR: [{ naoLidas: { gt: 0 } }, { ultimaMensagemEm: { lt: limite24h } }],
      },
    }),
    prisma.mensagem.count({
      where: {
        direcao: "OUT",
        hora: { gte: p.inicio, lt: p.fim },
        conversa: {
          ...(e.agenteId ? { agenteId: e.agenteId } : {}),
          ...(e.finalidade ? { finalidade: e.finalidade } : {}),
        },
      },
    }),
    prisma.mensagem.count({
      where: {
        direcao: "IN",
        hora: { gte: p.inicio, lt: p.fim },
        conversa: {
          ...(e.agenteId ? { agenteId: e.agenteId } : {}),
          ...(e.finalidade ? { finalidade: e.finalidade } : {}),
        },
      },
    }),
    // Clientes atendidos: leads distintos com >=1 msg no periodo nas conversas
    // do escopo.
    prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT c."leadId") AS total
      FROM "Conversa" c
      JOIN "Mensagem" m ON m."conversaId" = c.id
      WHERE m.hora >= ${p.inicio} AND m.hora < ${p.fim}
      ${condConversa(e)}
    `),
    // Tempo medio de 1a resposta (1o OUT apos 1o IN), por conversa, no periodo.
    prisma.$queryRaw<{ media: number | null }[]>(Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM (fo - fi)))::float AS media FROM (
        SELECT c.id,
          MIN(m.hora) FILTER (WHERE m.direcao = 'IN') AS fi,
          MIN(m.hora) FILTER (WHERE m.direcao = 'OUT') AS fo
        FROM "Conversa" c
        JOIN "Mensagem" m ON m."conversaId" = c.id
        WHERE m.hora >= ${p.inicio} AND m.hora < ${p.fim}
        ${condConversa(e)}
        GROUP BY c.id
      ) t
      WHERE fi IS NOT NULL AND fo IS NOT NULL AND fo > fi
    `),
    // Tempo medio de resolucao (fechadoEm - criadoEm) dos finalizados no periodo.
    prisma.negocio.findMany({
      where: negocioWhere(p, e, [StatusNeg.GANHO, StatusNeg.PERDIDO], true),
      select: { criadoEm: true, fechadoEm: true },
    }),
  ]);

  const valorVendido = somaValor._sum.valor
    ? Number(somaValor._sum.valor)
    : 0;
  const perdidos = finalizados - ganhos;
  const conversao = finalizados > 0 ? ganhos / finalizados : 0;
  const ticketMedio = ganhos > 0 ? valorVendido / ganhos : 0;
  const clientesAtendidos = Number(clientesRaw[0]?.total ?? 0);
  const tempoPrimeiraRespostaSeg = Math.round(primeiraRespRaw[0]?.media ?? 0);

  let somaResol = 0;
  let nResol = 0;
  for (const n of resolucaoRaw) {
    if (n.fechadoEm) {
      somaResol += (n.fechadoEm.getTime() - n.criadoEm.getTime()) / 1000;
      nResol += 1;
    }
  }
  const tempoResolucaoSeg = nResol > 0 ? Math.round(somaResol / nResol) : 0;

  return {
    clientesAtendidos,
    abertos,
    pendentes,
    finalizados,
    ganhos,
    perdidos,
    conversao,
    valorVendido,
    ticketMedio,
    msgEnviadas,
    msgRecebidas,
    tempoPrimeiraRespostaSeg,
    tempoResolucaoSeg,
  };
}

export type PontoTendencia = {
  dia: string; // AAAA-MM-DD
  atendimentos: number;
  fechamentos: number;
};

// Serie diaria de atendimentos (leads distintos com msg) e fechamentos.
export async function calcularTendencia(
  p: Periodo,
  e: Escopo,
): Promise<PontoTendencia[]> {
  const [aten, fech] = await Promise.all([
    prisma.$queryRaw<{ dia: Date; total: bigint }[]>(Prisma.sql`
      SELECT date_trunc('day', m.hora) AS dia, COUNT(DISTINCT c."leadId") AS total
      FROM "Conversa" c
      JOIN "Mensagem" m ON m."conversaId" = c.id
      WHERE m.hora >= ${p.inicio} AND m.hora < ${p.fim}
      ${condConversa(e)}
      GROUP BY 1 ORDER BY 1
    `),
    prisma.$queryRaw<{ dia: Date; total: bigint }[]>(Prisma.sql`
      SELECT date_trunc('day', n."fechadoEm") AS dia, COUNT(*) AS total
      FROM "Negocio" n
      WHERE n."fechadoEm" >= ${p.inicio} AND n."fechadoEm" < ${p.fim}
        AND n.status IN ('GANHO','PERDIDO')
        ${e.agenteId ? Prisma.sql`AND n."agenteId" = ${e.agenteId}` : Prisma.empty}
        ${e.finalidade ? Prisma.sql`AND n."finalidade" = ${e.finalidade}::"Finalidade"` : Prisma.empty}
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  const mapa = new Map<string, PontoTendencia>();
  const chave = (d: Date) => d.toISOString().slice(0, 10);
  for (const r of aten) {
    const k = chave(r.dia);
    mapa.set(k, {
      dia: k,
      atendimentos: Number(r.total),
      fechamentos: 0,
    });
  }
  for (const r of fech) {
    const k = chave(r.dia);
    const p0 = mapa.get(k) ?? { dia: k, atendimentos: 0, fechamentos: 0 };
    p0.fechamentos = Number(r.total);
    mapa.set(k, p0);
  }
  return Array.from(mapa.values()).sort((a, b) => a.dia.localeCompare(b.dia));
}

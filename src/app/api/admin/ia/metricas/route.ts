// SOL-2: metricas da Sol para o dashboard do admin. SOMENTE LEITURA — esta rota
// nao liga/desliga nada (isso e o painel de config).
//
//   GET /api/admin/ia/metricas?desde=YYYY-MM-DD&ate=YYYY-MM-DD
//
// Tudo agregado NO BANCO (groupBy / COUNT / SUM), sem N+1 e sem trazer a lista
// de eventos para a memoria. Nao devolve PII: nem nome, nem telefone, nem id de
// lead — so contagens, somas e a serie diaria.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { modelosComPreco } from "@/lib/custoIA";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FUSO = "America/Sao_Paulo";
// Teto dos agrupamentos de motivo: o dashboard mostra "onde a Sol trava", nao um
// dump. O que sobra vai para `outros` (nunca some silenciosamente).
const TOP_MOTIVOS = 12;

// Janela: `desde`/`ate` em YYYY-MM-DD (dia inteiro). Default = ultimos 30 dias.
function janela(sp: URLSearchParams): { desde: Date; ate: Date } {
  const bruto = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const d = bruto(sp.get("desde"));
  const a = bruto(sp.get("ate"));
  const ate = a ? new Date(`${a}T23:59:59.999Z`) : new Date();
  const desde = d
    ? new Date(`${d}T00:00:00.000Z`)
    : new Date(ate.getTime() - 29 * 24 * 60 * 60 * 1000);
  return desde <= ate ? { desde, ate } : { desde: ate, ate: desde };
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  // COUNT do Postgres volta BigInt; SUM de Decimal volta Prisma.Decimal.
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return Number(v.toString());
}

// Agrupa motivos e corta no topo, devolvendo o resto somado em `outros` — cortar
// em silencio faria a tabela parecer completa quando nao e.
function topMotivos(linhas: { motivo: string | null; _count: { _all: number } }[]) {
  const ordenado = [...linhas].sort((x, y) => y._count._all - x._count._all);
  const topo = ordenado.slice(0, TOP_MOTIVOS);
  const resto = ordenado.slice(TOP_MOTIVOS);
  return {
    itens: topo.map((l) => ({
      motivo: l.motivo?.trim() || "(sem motivo registrado)",
      total: l._count._all,
    })),
    outros: resto.reduce((s, l) => s + l._count._all, 0),
    distintos: ordenado.length,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const { desde, ate } = janela(req.nextUrl.searchParams);
  const where = { criadoEm: { gte: desde, lte: ate } };

  const [
    porAcao,
    motivosHandoff,
    motivosSilencio,
    porModelo,
    totais,
    conversao,
    serie,
  ] = await Promise.all([
    // Contadores por acao (responder / handoff / silenciar / colisao_humano).
    prisma.solEvento.groupBy({
      by: ["acao"],
      where,
      _count: { _all: true },
    }),
    prisma.solEvento.groupBy({
      by: ["motivo"],
      where: { ...where, acao: "handoff" },
      _count: { _all: true },
    }),
    prisma.solEvento.groupBy({
      by: ["motivo"],
      where: { ...where, acao: "silenciar" },
      _count: { _all: true },
    }),
    // Modelos usados no periodo — para avisar se algum ficou sem preco.
    prisma.solEvento.groupBy({
      by: ["modelo"],
      where,
      _count: { _all: true },
      _sum: { custoEstimado: true },
    }),
    // Volume + custo em UMA varredura. COUNT(DISTINCT) nao existe no groupBy do
    // Prisma, entao vai em SQL — continua agregado no banco.
    // `semMedicao` = eventos anteriores a SOL-2 (tokens NULL): contam como
    // atendimento, mas o custo deles e desconhecido, nao zero.
    prisma.$queryRaw<
      {
        eventos: bigint;
        conversas: bigint;
        leads: bigint;
        tokens_entrada: bigint | null;
        tokens_saida: bigint | null;
        custo: Prisma.Decimal | null;
        com_custo: bigint;
        sem_medicao: bigint;
      }[]
    >`
      SELECT COUNT(*)                                          AS eventos,
             COUNT(DISTINCT "conversaId")                      AS conversas,
             COUNT(DISTINCT "leadId")                          AS leads,
             SUM("tokensEntrada")                              AS tokens_entrada,
             SUM("tokensSaida")                                AS tokens_saida,
             SUM("custoEstimado")                              AS custo,
             COUNT(*) FILTER (WHERE "custoEstimado" IS NOT NULL) AS com_custo,
             COUNT(*) FILTER (WHERE "tokensEntrada" IS NULL)     AS sem_medicao
      FROM "SolEvento"
      WHERE "criadoEm" >= ${desde} AND "criadoEm" <= ${ate}
    `,
    // CONVERSAO. Definicao explicita (a UI repete): entre os LEADS que a Sol
    // atendeu no periodo, quantos tem um negocio GANHO fechado em ou depois do
    // PRIMEIRO atendimento dela. A ancora no primeiro evento evita creditar a
    // Sol por uma venda que ja estava fechada antes de ela falar com o cliente.
    prisma.$queryRaw<{ atendidos: bigint; ganhos: bigint }[]>`
      WITH atendidos AS (
        SELECT "leadId", MIN("criadoEm") AS primeiro
        FROM "SolEvento"
        WHERE "criadoEm" >= ${desde} AND "criadoEm" <= ${ate}
        GROUP BY "leadId"
      )
      SELECT COUNT(*) AS atendidos,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "Negocio" n
               WHERE n."leadId" = a."leadId"
                 AND n.status = 'GANHO'
                 AND n."fechadoEm" IS NOT NULL
                 AND n."fechadoEm" >= a.primeiro
             )) AS ganhos
      FROM atendidos a
    `,
    // Serie diaria no fuso do CRM (senao um atendimento das 22h cai no dia
    // seguinte para o vendedor).
    prisma.$queryRaw<
      { dia: Date; eventos: bigint; custo: Prisma.Decimal | null }[]
    >`
      SELECT date_trunc('day', "criadoEm" AT TIME ZONE ${FUSO})::date AS dia,
             COUNT(*)              AS eventos,
             SUM("custoEstimado")  AS custo
      FROM "SolEvento"
      WHERE "criadoEm" >= ${desde} AND "criadoEm" <= ${ate}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);

  const acoes: Record<string, number> = {
    responder: 0,
    handoff: 0,
    silenciar: 0,
    colisao_humano: 0,
  };
  for (const a of porAcao) acoes[a.acao] = (acoes[a.acao] ?? 0) + a._count._all;

  const t = totais[0];
  const eventos = num(t?.eventos);
  const conversas = num(t?.conversas);
  const custoTotal = num(t?.custo);
  const semMedicao = num(t?.sem_medicao);

  // Modelos sem preco na tabela (lib/custoIA): o custo total esta SUBESTIMADO
  // enquanto houver eventos deles. Reportamos em vez de esconder.
  const comPreco = new Set(modelosComPreco());
  const modelosSemPreco = porModelo
    .filter((m) => m.modelo && !comPreco.has(m.modelo))
    .map((m) => ({ modelo: m.modelo as string, eventos: m._count._all }));

  const atendidos = num(conversao[0]?.atendidos);
  const ganhos = num(conversao[0]?.ganhos);

  return NextResponse.json({
    periodo: { desde: desde.toISOString(), ate: ate.toISOString() },
    acoes,
    volume: {
      eventos,
      conversas,
      leads: num(t?.leads),
    },
    custo: {
      // Em DOLAR: e a moeda em que a Anthropic cobra. Nao convertemos para BRL
      // (exigiria uma cotacao de cambio que nao temos) — a UI rotula "US$".
      moeda: "USD",
      total: custoTotal,
      // Media por CONVERSA atendida, nao por evento: e o custo de um atendimento.
      medioPorConversa: conversas > 0 ? custoTotal / conversas : 0,
      tokensEntrada: num(t?.tokens_entrada),
      tokensSaida: num(t?.tokens_saida),
      // Honestidade do numero: quantos eventos entraram na soma, quantos sao
      // anteriores a medicao, e quais modelos ficaram sem preco.
      eventosComCusto: num(t?.com_custo),
      eventosSemMedicao: semMedicao,
      modelosSemPreco,
    },
    motivos: {
      handoff: topMotivos(motivosHandoff),
      silenciar: topMotivos(motivosSilencio),
    },
    conversao: {
      atendidos,
      ganhos,
      taxa: atendidos > 0 ? ganhos / atendidos : 0,
      // A UI mostra isso ao lado do numero — a definicao importa tanto quanto ele.
      criterio:
        "leads atendidos pela Sol no periodo que tem negocio GANHO fechado em ou depois do primeiro atendimento dela",
    },
    serie: serie.map((d) => ({
      dia:
        d.dia instanceof Date
          ? d.dia.toISOString().slice(0, 10)
          : String(d.dia).slice(0, 10),
      eventos: num(d.eventos),
      custo: num(d.custo),
    })),
  });
}

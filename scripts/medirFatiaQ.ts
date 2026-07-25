// Medicao da Fatia Q (paginacao das colunas do Kanban). READ-ONLY: nao escreve
// nada, nao cria indice, nao altera dados.
//
//   DATABASE_URL=... npx tsx scripts/medirFatiaQ.ts
//
// Por FINALIDADE, no mesmo baseline da rota (admin "todos", periodo TODOS, sem
// busca/temperatura/etiqueta), compara o trabalho do PRIMEIRO carregamento:
//   ANTES  = um findMany sem limite (todos os negocios do funil) + resumo.
//   DEPOIS = fixadas (1 consulta) + ate 51 por etapa + resumo.
// Reporta, para cada um: cards trafegados, KB do JSON e ms.
//
// Depois roda EXPLAIN (ANALYZE) na consulta QUENTE (a coluna ativa com mais
// cards) para responder objetivamente se o indice (etapaId, entrouEtapaEm) e
// necessario: sem ele o Postgres ordena a coluna inteira e o LIMIT 51 nao
// economiza nada; com ele o plano vira Index Scan e para no 51o.
//
// As helpers vem de src/lib/paginacaoKanban.ts — as MESMAS que a rota usa.
import { prisma } from "../src/lib/prisma";
import { includeCard, cardNegocio } from "../src/lib/serializar";
import {
  TETO_FIXADAS,
  ordemDaEtapa,
  particoesFixadas,
  LIMITE_PADRAO,
} from "../src/lib/paginacaoKanban";
import { Finalidade, FinalidadeEtapa } from "../src/generated/prisma/enums";
import type { Prisma } from "../src/generated/prisma/client";

const INDICE = "Negocio_etapaId_entrouEtapaEm_idx";

function kb(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), "utf8") / 1024;
}
function f1(n: number): string {
  return n.toFixed(1);
}

async function etapasDe(finalidades: Finalidade[]) {
  const fe: FinalidadeEtapa[] = [FinalidadeEtapa.AMBAS];
  if (finalidades.includes(Finalidade.VENDA)) fe.push(FinalidadeEtapa.VENDA);
  if (finalidades.includes(Finalidade.POS_VENDA))
    fe.push(FinalidadeEtapa.POS_VENDA);
  return prisma.etapa.findMany({
    where: { ativo: true, finalidade: { in: fe } },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true, cor: true, tipo: true, finalidade: true, ordem: true },
  });
}

function resumoQueries(where: Prisma.NegocioWhereInput) {
  return [
    prisma.negocio.groupBy({
      by: ["etapaId"],
      where: { ...where, valorAjustado: { not: null } },
      _count: { _all: true },
      _sum: { valorAjustado: true },
    }),
    prisma.negocio.groupBy({
      by: ["etapaId"],
      where: { ...where, valorAjustado: null },
      _count: { _all: true },
      _sum: { valor: true },
    }),
  ] as const;
}

async function porFinalidade(f: Finalidade) {
  console.log(`\n================ FINALIDADE: ${f} ================`);
  const finalidades = [f];
  const where: Prisma.NegocioWhereInput = { finalidade: { in: finalidades } };
  const etapas = await etapasDe(finalidades);
  const { soFixadas, semFixadas } = particoesFixadas(finalidades);

  // ---------- ANTES (como era ate a Fatia P) ----------
  const t0 = Date.now();
  const [todos, ra0, rv0] = await Promise.all([
    prisma.negocio.findMany({
      where,
      include: includeCard,
      orderBy: { entrouEtapaEm: "desc" },
    }),
    ...resumoQueries(where),
  ]);
  const colunasAntes: Record<string, ReturnType<typeof cardNegocio>[]> = {};
  for (const e of etapas) colunasAntes[e.id] = [];
  for (const n of todos) {
    if (n.etapaId && colunasAntes[n.etapaId]) colunasAntes[n.etapaId].push(cardNegocio(n));
  }
  const msAntes = Date.now() - t0;
  const cardsAntes = Object.values(colunasAntes).reduce((s, c) => s + c.length, 0);
  const kbAntes = kb({ etapas, colunas: colunasAntes, resumo: { ra0: ra0.length, rv0: rv0.length } });

  // ---------- DEPOIS (Fatia Q: fixadas + 50 por coluna) ----------
  const t1 = Date.now();
  const [comPin, paginas, ra1, rv1] = await Promise.all([
    prisma.negocio.findMany({
      where: { AND: [where, soFixadas] },
      include: includeCard,
      orderBy: [{ entrouEtapaEm: "desc" }, { id: "desc" }],
      take: TETO_FIXADAS,
    }),
    Promise.all(
      etapas.map((e) =>
        prisma.negocio.findMany({
          where: { AND: [where, { etapaId: e.id }, semFixadas] },
          include: includeCard,
          orderBy: ordemDaEtapa(e.tipo),
          take: LIMITE_PADRAO + 1,
        }),
      ),
    ),
    ...resumoQueries(where),
  ]);
  const colunasDepois: Record<string, ReturnType<typeof cardNegocio>[]> = {};
  const fixadasPorEtapa: Record<string, ReturnType<typeof cardNegocio>[]> = {};
  for (const n of comPin) {
    if (n.etapaId) (fixadasPorEtapa[n.etapaId] ??= []).push(cardNegocio(n));
  }
  etapas.forEach((e, i) => {
    colunasDepois[e.id] = [
      ...(fixadasPorEtapa[e.id] ?? []),
      ...paginas[i].slice(0, LIMITE_PADRAO).map(cardNegocio),
    ];
  });
  const msDepois = Date.now() - t1;
  const cardsDepois = Object.values(colunasDepois).reduce((s, c) => s + c.length, 0);
  const kbDepois = kb({ etapas, colunas: colunasDepois, resumo: { ra1: ra1.length, rv1: rv1.length } });

  // ---------- Totais por etapa (do resumo = banco) ----------
  const totais: Record<string, number> = {};
  for (const e of etapas) totais[e.id] = 0;
  for (const r of [...ra1, ...rv1]) {
    if (r.etapaId && totais[r.etapaId] !== undefined) totais[r.etapaId] += r._count._all;
  }

  console.log("\ncoluna                 | total no banco | carregado antes -> depois");
  for (const e of etapas) {
    console.log(
      `${e.nome.padEnd(22)} | ${String(totais[e.id]).padStart(14)} | ` +
        `${String(colunasAntes[e.id].length).padStart(6)} -> ${colunasDepois[e.id].length}`,
    );
  }
  console.log(
    `\nTOTAL: cards ${cardsAntes} -> ${cardsDepois} | ` +
      `KB ${f1(kbAntes)} -> ${f1(kbDepois)} | ms ${msAntes} -> ${msDepois}`,
  );
  if (cardsAntes > 0) {
    console.log(
      `reducao: ${f1((1 - cardsDepois / cardsAntes) * 100)}% dos cards, ` +
        `${f1((1 - kbDepois / kbAntes) * 100)}% do payload`,
    );
  }

  // ---------- EXPLAIN da coluna QUENTE ----------
  const quente = etapas
    .filter((e) => e.tipo === "ABERTA")
    .sort((a, b) => (totais[b.id] ?? 0) - (totais[a.id] ?? 0))[0];
  if (quente && (totais[quente.id] ?? 0) > 0) {
    const plano = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN (ANALYZE, BUFFERS)
       SELECT id FROM "Negocio"
       WHERE "finalidade" = $1::"Finalidade" AND "etapaId" = $2
       ORDER BY "entrouEtapaEm" DESC, "id" DESC
       LIMIT ${LIMITE_PADRAO + 1}`,
      f,
      quente.id,
    );
    const txt = plano.map((l) => l["QUERY PLAN"]).join("\n");
    console.log(
      `\nEXPLAIN da coluna quente "${quente.nome}" (${totais[quente.id]} cards):`,
    );
    console.log(txt.split("\n").map((l) => "  " + l).join("\n"));
    const ordenaTudo = /\bSort\b/.test(txt) && !/Index Scan.*entrouEtapaEm/.test(txt);
    console.log(
      ordenaTudo
        ? `-> INDICE INDICADO: ha Sort da coluna inteira; o LIMIT nao economiza. Crie ${INDICE}.`
        : `-> sem Sort da coluna inteira: o plano ja para no ${LIMITE_PADRAO + 1}o. Indice NAO indicado.`,
    );
  }
}

async function main() {
  const existe = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'Negocio' AND indexname = ${INDICE}`;
  console.log(
    existe.length > 0
      ? `indice ${INDICE}: JA EXISTE (esta medicao e o "depois do indice")`
      : `indice ${INDICE}: ausente (esta medicao e o "antes do indice")`,
  );
  await porFinalidade(Finalidade.VENDA);
  await porFinalidade(Finalidade.POS_VENDA);
  await prisma.$disconnect();
}

void main();

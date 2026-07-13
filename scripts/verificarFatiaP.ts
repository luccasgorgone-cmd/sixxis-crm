// Verificacao anti-regressao da Fatia P (rode com DATABASE_URL apontando ao banco):
//   npx tsx scripts/verificarFatiaP.ts
// READ-ONLY: nao escreve nada. Compara, por finalidade e por etapa:
//   (a) contador e soma ANTES (estilo client: carrega e soma valorAjustado ?? valor)
//       vs DEPOIS (resumo: 2 groupBy no banco, COALESCE(valorAjustado, valor));
//   (b) busca server-side x busca client-side (nome sem acento + telefone +
//       conteudo de conversa) em termos de teste — compara o CONJUNTO de ids;
//   (c) tempo da busca por CONTEUDO com um termo comum.
// Baseline: admin "todos", periodo TODOS, sem outros filtros (mesmo where default
// da rota). Ajuste TERMOS_BUSCA para o seu banco.
import { prisma } from "../src/lib/prisma";
import { nomeEfetivo, nomeBuscaDe } from "../src/lib/cliente";
import { normalizarTexto } from "../src/lib/format";
import { Finalidade } from "../src/generated/prisma/enums";

const TERMOS_BUSCA = ["jose", "climatizador", "silva"]; // acento/nome + conteudo

function brl(n: number): string {
  return `R$ ${(Math.round(n * 100) / 100).toFixed(2)}`;
}

async function porFinalidade(f: Finalidade) {
  console.log(`\n================ FINALIDADE: ${f} ================`);
  const where = { finalidade: { in: [f] } };

  // ---- (a) contador + soma: client-style vs resumo ----
  const cards = await prisma.negocio.findMany({
    where,
    select: { etapaId: true, valor: true, valorAjustado: true },
  });
  const cli: Record<string, { total: number; soma: number }> = {};
  for (const n of cards) {
    if (!n.etapaId) continue;
    const v = n.valorAjustado != null ? Number(n.valorAjustado) : n.valor != null ? Number(n.valor) : 0;
    cli[n.etapaId] ??= { total: 0, soma: 0 };
    cli[n.etapaId].total += 1;
    cli[n.etapaId].soma += v;
  }

  const [aggAdj, aggVal] = await Promise.all([
    prisma.negocio.groupBy({ by: ["etapaId"], where: { ...where, valorAjustado: { not: null } }, _count: { _all: true }, _sum: { valorAjustado: true } }),
    prisma.negocio.groupBy({ by: ["etapaId"], where: { ...where, valorAjustado: null }, _count: { _all: true }, _sum: { valor: true } }),
  ]);
  const res: Record<string, { total: number; soma: number }> = {};
  for (const r of aggAdj) if (r.etapaId) { res[r.etapaId] ??= { total: 0, soma: 0 }; res[r.etapaId].total += r._count._all; res[r.etapaId].soma += Number(r._sum.valorAjustado ?? 0); }
  for (const r of aggVal) if (r.etapaId) { res[r.etapaId] ??= { total: 0, soma: 0 }; res[r.etapaId].total += r._count._all; res[r.etapaId].soma += Number(r._sum.valor ?? 0); }

  const etapas = await prisma.etapa.findMany({ where: { ativo: true }, select: { id: true, nome: true } });
  const nomeEtapa = new Map(etapas.map((e) => [e.id, e.nome]));
  let divergencias = 0;
  console.log("etapa | contador antes/depois | soma antes/depois");
  for (const eid of new Set([...Object.keys(cli), ...Object.keys(res)])) {
    const a = cli[eid] ?? { total: 0, soma: 0 };
    const b = res[eid] ?? { total: 0, soma: 0 };
    const okC = a.total === b.total;
    const okS = Math.abs(a.soma - b.soma) < 0.01;
    if (!okC || !okS) divergencias++;
    console.log(`${(nomeEtapa.get(eid) ?? eid).padEnd(22)} | ${a.total}/${b.total} ${okC ? "OK" : "DIVERGE"} | ${brl(a.soma)}/${brl(b.soma)} ${okS ? "OK" : "DIVERGE"}`);
  }
  console.log(divergencias === 0 ? "-> contador/soma: TUDO BATE" : `-> ${divergencias} DIVERGENCIA(S) — PARE e investigue`);

  // ---- (b) busca: client-style vs server-side, por termo ----
  for (const termo of TERMOS_BUSCA) {
    const q = termo.trim();
    const qNorm = normalizarTexto(q);
    const qDig = q.replace(/\D/g, "");

    // Client-style: carrega leads + resolve telsConteudo, aplica o OR de 3 fontes.
    const negs = await prisma.negocio.findMany({ where, select: { id: true, lead: { select: { nome: true, pushName: true, nomeManual: true, telefone: true } } } });
    const msgs = await prisma.conversa.findMany({ where: { finalidade: f, mensagens: { some: { conteudo: { contains: q, mode: "insensitive" } } } }, select: { lead: { select: { telefone: true } } } });
    const telsConteudo = new Set(msgs.map((c) => (c.lead?.telefone ?? "").replace(/\D/g, "")));
    const idsCli = new Set<string>();
    for (const n of negs) {
      const l = n.lead;
      const nome = normalizarTexto(nomeEfetivo(l));
      const tel = l.telefone.replace(/\D/g, "");
      if (nome.includes(qNorm) || (qDig && tel.includes(qDig)) || telsConteudo.has(tel)) idsCli.add(n.id);
    }

    // Server-side: o MESMO where da rota.
    const t0 = Date.now();
    const idsSrv = new Set(
      (await prisma.negocio.findMany({
        where: {
          ...where,
          lead: {
            OR: [
              { nomeBusca: { contains: qNorm } },
              { nome: { contains: q, mode: "insensitive" } },
              { nomeManual: { contains: q, mode: "insensitive" } },
              { pushName: { contains: q, mode: "insensitive" } },
              { conversas: { some: { finalidade: { in: [f] }, mensagens: { some: { conteudo: { contains: q, mode: "insensitive" } } } } } },
              ...(qDig ? [{ telefone: { contains: qDig } }] : []),
            ],
          },
        },
        select: { id: true },
      })).map((n) => n.id),
    );
    const dtMs = Date.now() - t0;

    const soClient = [...idsCli].filter((x) => !idsSrv.has(x));
    const soServer = [...idsSrv].filter((x) => !idsCli.has(x));
    const igual = soClient.length === 0 && soServer.length === 0;
    console.log(`busca "${q}": client=${idsCli.size} server=${idsSrv.size} ${igual ? "IGUAIS" : `DIVERGE (soClient=${soClient.length}, soServer=${soServer.length})`} | tempo server=${dtMs}ms`);
    if (dtMs > 1500) console.log(`  ATENCAO: busca > 1.5s (${dtMs}ms) — reporte (indice trigram / limitar alcance).`);
  }
}

async function main() {
  // Sanidade: quantos leads ainda sem nomeBusca (backfill pendente).
  const semBusca = await prisma.lead.count({ where: { nomeBusca: null } });
  if (semBusca > 0) console.log(`AVISO: ${semBusca} leads com nomeBusca NULL — rode o backfill (seed) antes de confiar na busca por nome.`);
  await porFinalidade(Finalidade.VENDA);
  await porFinalidade(Finalidade.POS_VENDA);
  await prisma.$disconnect();
}

void main();

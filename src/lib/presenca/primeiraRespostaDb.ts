// FONTE ÚNICA (camada de banco) dos segundos de 1a resposta por conversa, medidos
// pelo tempo ONLINE do dono com fallback wall-clock. Usada pela media
// (metricas.ts) e pelo % no prazo + histograma (indicadores.ts) — antes cada um
// tinha sua propria query "1o IN/1o OUT por conversa" (duplicadas). Agora ha uma
// so. Ver primeiraResposta.ts (nucleo puro) e DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md.
import { prisma } from "../prisma";
import { Prisma } from "../../generated/prisma/client";
import type { Finalidade } from "../../generated/prisma/enums";
import {
  segundos1aRespostaPorConversa,
  type ConversaResp,
} from "./primeiraResposta";
import { type PeriodoOnline } from "./tempoOnline";

export type EscopoResp = { agenteId?: string; finalidade?: Finalidade };

// Fragmento SQL de escopo para a tabela Conversa (alias c).
function condConversaSql(e: EscopoResp): Prisma.Sql {
  const partes: Prisma.Sql[] = [];
  if (e.agenteId) partes.push(Prisma.sql`AND c."agenteId" = ${e.agenteId}`);
  if (e.finalidade) {
    partes.push(Prisma.sql`AND c."finalidade" = ${e.finalidade}::"Finalidade"`);
  }
  return partes.length ? Prisma.join(partes, " ") : Prisma.empty;
}

// Segundos de 1a resposta por conversa no periodo/escopo (online do dono, com
// fallback). Lista vazia quando nao ha conversa com 1a resposta valida.
export async function coletarSegundos1aResposta(
  inicio: Date,
  fim: Date,
  e: EscopoResp = {},
): Promise<number[]> {
  const [linhas, cutRows] = await Promise.all([
    prisma.$queryRaw<{ agenteId: string | null; fi: Date; fo: Date }[]>(Prisma.sql`
      SELECT t."agenteId", t.fi, t.fo FROM (
        SELECT c.id, c."agenteId" AS "agenteId",
          MIN(m.hora) FILTER (WHERE m.direcao = 'IN') AS fi,
          MIN(m.hora) FILTER (WHERE m.direcao = 'OUT') AS fo
        FROM "Conversa" c
        JOIN "Mensagem" m ON m."conversaId" = c.id
        WHERE m.hora >= ${inicio} AND m.hora < ${fim}
        ${condConversaSql(e)}
        GROUP BY c.id, c."agenteId"
      ) t
      WHERE t.fi IS NOT NULL AND t.fo IS NOT NULL AND t.fo > t.fi
    `),
    prisma.$queryRaw<{ min: Date | null }[]>(Prisma.sql`
      SELECT MIN("inicioEm") AS min FROM "PresencaPeriodo"
    `),
  ]);

  const presencaAtivaDesde = cutRows[0]?.min ?? null;
  const periodosPorAgente = new Map<string, PeriodoOnline[]>();

  if (presencaAtivaDesde && linhas.length > 0) {
    const agenteIds = [
      ...new Set(
        linhas
          .map((r) => r.agenteId)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (agenteIds.length > 0) {
      let minFi = linhas[0].fi;
      let maxFo = linhas[0].fo;
      for (const r of linhas) {
        if (r.fi < minFi) minFi = r.fi;
        if (r.fo > maxFo) maxFo = r.fo;
      }
      const periodos = await prisma.presencaPeriodo.findMany({
        where: {
          agenteId: { in: agenteIds },
          inicioEm: { lt: maxFo },
          OR: [{ fimEm: null }, { fimEm: { gt: minFi } }],
        },
        select: { agenteId: true, inicioEm: true, fimEm: true },
      });
      for (const pp of periodos) {
        const lista = periodosPorAgente.get(pp.agenteId) ?? [];
        lista.push({ inicio: pp.inicioEm, fim: pp.fimEm });
        periodosPorAgente.set(pp.agenteId, lista);
      }
    }
  }

  const conversas: ConversaResp[] = linhas;
  return segundos1aRespostaPorConversa(conversas, periodosPorAgente, presencaAtivaDesde);
}

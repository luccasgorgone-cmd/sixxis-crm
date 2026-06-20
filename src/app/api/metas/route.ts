// Colaborador: suas metas (COLABORADOR) + metas de EQUIPE que o incluem, cada
// uma com progresso. Metas de colaborador trazem tambem a posicao no ranking da
// metrica entre os colegas.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import {
  calcularProgresso,
  rankingMetrica,
  type MetaBase,
} from "@/lib/metas";
import { EscopoMeta, Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const eu = await prisma.agente.findUnique({
    where: { id: agente.id },
    select: { acessoVenda: true, acessoPosVenda: true },
  });
  const acessoVenda = eu?.acessoVenda ?? false;
  const acessoPosVenda = eu?.acessoPosVenda ?? false;

  // Finalidades de equipe que me incluem (AMBAS sempre inclui).
  const finsEquipe: ("VENDA" | "POS_VENDA" | "AMBAS")[] = ["AMBAS"];
  if (acessoVenda) finsEquipe.push("VENDA");
  if (acessoPosVenda) finsEquipe.push("POS_VENDA");

  const [minhas, equipe] = await Promise.all([
    prisma.meta.findMany({
      where: { escopo: EscopoMeta.COLABORADOR, agenteId: agente.id, ativo: true },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.meta.findMany({
      where: {
        escopo: EscopoMeta.EQUIPE,
        ativo: true,
        finalidade: { in: finsEquipe },
      },
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  const agora = new Date();

  const minhasComProgresso = await Promise.all(
    minhas.map(async (m) => {
      const meta = m as MetaBase;
      const fin =
        meta.finalidade === "AMBAS"
          ? undefined
          : (meta.finalidade as Finalidade);
      const [progresso, ranking] = await Promise.all([
        calcularProgresso(meta, agora),
        rankingMetrica(
          { inicio: meta.inicio, fim: meta.fim },
          fin,
          meta.metrica,
          agente.id,
        ),
      ]);
      return { ...m, progresso, ranking };
    }),
  );

  const equipeComProgresso = await Promise.all(
    equipe.map(async (m) => ({
      ...m,
      progresso: await calcularProgresso(m as MetaBase, agora),
      ranking: null,
    })),
  );

  return NextResponse.json({
    minhas: minhasComProgresso,
    equipe: equipeComProgresso,
  });
}

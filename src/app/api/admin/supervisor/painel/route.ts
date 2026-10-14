// Admin: PAINEL do Supervisor Comercial (Camada 1, determinístico). Somente
// leitura — recalcula os indicadores (montarPainel) para a janela/escopo pedidos.
// Não chama IA, não gasta token, não escreve nada. É a mesma forma (PainelSupervisor)
// que a UI renderiza e que o contexto da IA recebe.
//
// GET /api/admin/supervisor/painel?periodo=hoje|semana|15d|mes[&inicio=&fim=]
//                                 [&finalidade=VENDA|POS_VENDA][&agenteId=]
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { resolverPeriodo, calcularMetricas } from "@/lib/metricas";
import { montarPainel } from "@/lib/supervisor/painel";
import { pctDentroDoPrazo1aResposta } from "@/lib/supervisor/indicadores";
import { resolverLimiares, IND, type EscopoSupervisor } from "@/lib/supervisor/tipos";
import { prisma } from "@/lib/prisma";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const { inicio, fim } = resolverPeriodo(
    sp.get("periodo"),
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );

  const f = sp.get("finalidade");
  const finalidade =
    f === Finalidade.VENDA || f === Finalidade.POS_VENDA ? (f as Finalidade) : null;
  const agenteId = sp.get("agenteId")?.trim() || undefined;

  // Limiares do semáforo vêm da config (parcial/legado tolerado por resolverLimiares).
  const cfg = await prisma.supervisorConfig
    .findFirst({ select: { limiaresJson: true }, orderBy: { atualizadoEm: "desc" } })
    .catch(() => null);
  const limiares = resolverLimiares(cfg?.limiaresJson);

  const painel = await montarPainel(
    { inicio, fim },
    finalidade,
    limiares,
    { agenteId },
    new Date(),
  );

  // Variação período-a-período: calcula a janela IMEDIATAMENTE anterior (mesma
  // duração) e anexa valorAnterior aos indicadores de PERÍODO. É barato — só as
  // duas funções de período (métricas + 1ª resposta), sem refazer o painel todo
  // (nada de ranking/origens/snapshot de abertos).
  try {
    const dur = fim.getTime() - inicio.getTime();
    if (dur > 0) {
      const janelaAnt = { inicio: new Date(inicio.getTime() - dur), fim: inicio };
      const escopoSup: EscopoSupervisor = {
        finalidade: finalidade ?? undefined,
        agenteId,
      };
      const [mAnt, pctAnt] = await Promise.all([
        calcularMetricas(janelaAnt, escopoSup),
        pctDentroDoPrazo1aResposta(janelaAnt, limiares.prazo1aRespostaSeg, escopoSup),
      ]);
      const anteriores: Record<string, number | null> = {
        [IND.PCT_PRAZO]: pctAnt.pct,
        [IND.CONVERSAO]: mAnt.conversao,
        [IND.TEMPO_1A_RESP]: mAnt.tempoPrimeiraRespostaSeg || null,
        [IND.TICKET]: mAnt.ticketMedio || null,
      };
      painel.indicadores = painel.indicadores.map((ind) =>
        ind.chave in anteriores
          ? { ...ind, valorAnterior: anteriores[ind.chave] }
          : ind,
      );
    }
  } catch {
    // Se a comparação falhar, segue sem deltas — o painel principal é o que importa.
  }

  return NextResponse.json(painel);
}

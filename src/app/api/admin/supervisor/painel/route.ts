// Admin: PAINEL do Supervisor Comercial (Camada 1, determinístico). Somente
// leitura — recalcula os indicadores (montarPainel) para a janela/escopo pedidos.
// Não chama IA, não gasta token, não escreve nada. É a mesma forma (PainelSupervisor)
// que a UI renderiza e que o contexto da IA recebe.
//
// GET /api/admin/supervisor/painel?periodo=hoje|semana|15d|mes[&inicio=&fim=]
//                                 [&finalidade=VENDA|POS_VENDA][&agenteId=]
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { resolverPeriodo } from "@/lib/metricas";
import { montarPainel } from "@/lib/supervisor/painel";
import { resolverLimiares } from "@/lib/supervisor/tipos";
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
  return NextResponse.json(painel);
}

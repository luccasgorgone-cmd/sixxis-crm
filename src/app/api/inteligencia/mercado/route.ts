// Inteligencia/Mapa: potencial de mercado por UF (populacao residente estimada,
// IBGE). Cache PERSISTENTE reusando ClimaCacheUF (uf="BR", dias=-3, TTL 7 dias);
// falha de fetch NUNCA sobrescreve o ultimo bom. Sempre 200 com o melhor dado.
// GET /api/inteligencia/mercado?refresh=0  (agente logado -> 401)
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { obterMercadoComCache } from "@/lib/ibge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const { porUF, atualizadoEm, stale } = await obterMercadoComCache(refresh);

  return NextResponse.json({
    fonte: "IBGE — Estimativas de Populacao",
    porUF,
    atualizadoEm,
    stale,
  });
}

// Tendencias de busca do Mercado Livre para o hub (agente -> 401). Se nao
// conectado, responde 200 { conectado:false, itens:[] } (nunca erro feio). Se
// conectado, le /trends/MLB com CACHE PERSISTENTE (ClimaCacheUF uf="ML", dias=-4,
// TTL 6h; falha nao sobrescreve o ultimo bom). Sempre 200 com o melhor dado.
// GET /api/trends/mercadolivre?refresh=0
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import {
  getAccessTokenValido,
  buscarTendenciasML,
  UF_ML,
  DIAS_ML,
  TTL_ML_MS,
  type ItemTrendML,
} from "@/lib/mercadolivre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const token = await getAccessTokenValido();
  if (!token) {
    return NextResponse.json({ conectado: false, itens: [] });
  }

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const agora = Date.now();

  const linha = await prisma.climaCacheUF.findUnique({
    where: { uf_dias: { uf: UF_ML, dias: DIAS_ML } },
  });
  const stale =
    !linha || refresh || agora - linha.atualizadoEm.getTime() > TTL_ML_MS;

  let itens: ItemTrendML[] = linha
    ? ((linha.dados as unknown as { itens?: ItemTrendML[] }).itens ?? [])
    : [];
  let atualizadoEm: Date | null = linha?.atualizadoEm ?? null;

  if (stale) {
    const novos = await buscarTendenciasML(token);
    if (novos) {
      const nowDate = new Date();
      await prisma.climaCacheUF.upsert({
        where: { uf_dias: { uf: UF_ML, dias: DIAS_ML } },
        create: {
          uf: UF_ML,
          dias: DIAS_ML,
          dados: { itens: novos } as object,
          atualizadoEm: nowDate,
        },
        update: { dados: { itens: novos } as object, atualizadoEm: nowDate },
      });
      itens = novos;
      atualizadoEm = nowDate;
    }
  }

  return NextResponse.json({
    conectado: true,
    fonte: "Mercado Livre",
    atualizadoEm: atualizadoEm ? atualizadoEm.toISOString() : null,
    stale: atualizadoEm ? agora - atualizadoEm.getTime() > TTL_ML_MS : false,
    itens,
  });
}

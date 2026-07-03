// Diagnostico admin da PREVISAO de clima: roda a query completa da Open-Meteo
// para 1 UF e devolve status + reason CRU (a Open-Meteo responde
// { error:true, reason:"..." } em 400), alem de qual camada de variaveis funciona.
// Serve para o dono/dev conferir o motivo exato sem depender do log do Railway.
// GET /api/admin/diagnostico/clima?uf=SP  (somente admin)
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { CAPITAIS } from "@/lib/capitais";
import { diagnosticarPrevisao } from "@/lib/clima-estado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }
  const uf = (req.nextUrl.searchParams.get("uf") ?? "SP").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf) || !CAPITAIS[uf]) {
    return NextResponse.json({ erro: "uf invalida" }, { status: 400 });
  }
  const diag = await diagnosticarPrevisao(uf);
  return NextResponse.json(diag);
}

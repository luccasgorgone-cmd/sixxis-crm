// Status da integracao Mercado Livre (admin -> 403). Nao vaza token.
// GET /api/admin/integracoes/mercadolivre/status
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { statusML } from "@/lib/mercadolivre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }
  return NextResponse.json(await statusML());
}

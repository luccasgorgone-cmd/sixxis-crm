// Desconecta a integracao Mercado Livre (admin -> 403): zera os tokens no banco.
// POST /api/admin/integracoes/mercadolivre/desconectar
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { desconectarML } from "@/lib/mercadolivre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }
  await desconectarML();
  return NextResponse.json({ ok: true });
}

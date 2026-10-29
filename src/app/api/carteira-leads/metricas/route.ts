// GET (admin/supervisor): metricas agregadas da carteira — por vendedor
// (total, por status, ativados hoje) e status global. So admin.
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { metricasCarteira } from "@/lib/carteira/consulta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  const dados = await metricasCarteira();
  return NextResponse.json(dados);
}

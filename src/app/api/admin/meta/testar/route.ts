// Admin: testa a conexao com a Graph API (Meta CAPI). Usa as credenciais
// enviadas (antes de salvar) ou as ja salvas. Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { testarConexaoMeta } from "@/lib/metaCapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { pixelId?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const r = await testarConexaoMeta({
    pixelId: body.pixelId?.trim() || null,
    token: body.token?.trim() || null,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 200 });
}

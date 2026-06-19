// Admin: configura o webhook da instancia na Evolution apontando para a nossa
// rota de ingestao (.../api/webhook/evolution), com x-webhook-secret e o evento
// MESSAGES_UPSERT. A URL publica e derivada da origem da requisicao.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { configurarWebhook } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const inst = await prisma.instanciaWhatsApp.findUnique({
    where: { id },
    select: { instanciaEvolution: true },
  });
  if (!inst) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { erro: "WEBHOOK_SECRET nao configurado" },
      { status: 500 },
    );
  }

  // Prioriza o host publico real atras do proxy (Railway).
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origem = host ? `${proto}://${host}` : req.nextUrl.origin;
  const url = `${origem}/api/webhook/evolution`;

  const r = await configurarWebhook(inst.instanciaEvolution, url, secret);
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, erro: "falha ao configurar webhook na Evolution", url, detalhe: r.raw },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, url });
}

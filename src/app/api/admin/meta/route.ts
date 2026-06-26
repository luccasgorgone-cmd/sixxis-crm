// Admin: configuracao do Meta Conversions API (Pixel ID + token + test code).
// O token NUNCA volta para o browser (apenas um indicador "temToken"). Somente ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function configId(): Promise<string> {
  const c = await prisma.configuracaoCRM.findFirst({ select: { id: true } });
  if (c) return c.id;
  const novo = await prisma.configuracaoCRM.create({ data: {} });
  return novo.id;
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const cfg = await prisma.configuracaoCRM.findFirst({
    select: { metaPixelId: true, metaCapiToken: true, metaTestEventCode: true },
  });
  return NextResponse.json({
    pixelId: cfg?.metaPixelId ?? "",
    testEventCode: cfg?.metaTestEventCode ?? "",
    temToken: !!cfg?.metaCapiToken,
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { pixelId?: string; token?: string; testEventCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const id = await configId();
  const data: {
    metaPixelId?: string | null;
    metaCapiToken?: string;
    metaTestEventCode?: string | null;
  } = {};
  if (body.pixelId !== undefined) data.metaPixelId = body.pixelId.trim() || null;
  if (body.testEventCode !== undefined) {
    data.metaTestEventCode = body.testEventCode.trim() || null;
  }
  // Token: so atualiza quando enviado nao-vazio (vazio = mantem o atual).
  if (body.token !== undefined && body.token.trim()) {
    data.metaCapiToken = body.token.trim();
  }
  await prisma.configuracaoCRM.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

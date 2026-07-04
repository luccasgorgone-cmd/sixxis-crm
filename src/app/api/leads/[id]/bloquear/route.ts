// Bloqueia/desbloqueia um contato (toggle). SOMENTE ADMIN. Quando bloqueado, a
// ingestao registra as mensagens mas NAO notifica/roteia/responde (silencia) —
// ver src/lib/queue.ts. Nao envia nada ao cliente. Fatia 2.81.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, bloqueado: true },
  });
  if (!lead) {
    return NextResponse.json({ erro: "cliente nao encontrado" }, { status: 404 });
  }

  const novo = !lead.bloqueado;
  await prisma.lead.update({
    where: { id },
    data: {
      bloqueado: novo,
      bloqueadoEm: novo ? new Date() : null,
      bloqueadoPor: novo ? admin.id : null,
    },
  });

  getIO()?.emit("cliente:atualizado", { leadId: id, nome: null });
  return NextResponse.json({ ok: true, bloqueado: novo });
}

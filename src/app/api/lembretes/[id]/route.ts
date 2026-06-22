// PATCH de um lembrete: {status: feito|cancelar} ou {dataHora} (remarcar/snooze).
// Dono do lembrete (agenteId) ou admin podem alterar.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import { StatusLembrete } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { status?: string; dataHora?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const lembrete = await prisma.lembrete.findUnique({
    where: { id },
    select: { id: true, agenteId: true, leadId: true },
  });
  if (!lembrete) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!ehAdmin(agente.papel) && lembrete.agenteId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const data: Prisma.LembreteUncheckedUpdateInput = {};

  // Remarcar / snooze.
  if (body.dataHora !== undefined) {
    const nova = new Date(body.dataHora);
    if (Number.isNaN(nova.getTime())) {
      return NextResponse.json({ erro: "dataHora invalida" }, { status: 400 });
    }
    data.dataHora = nova;
    // Remarcar reabre um lembrete concluido/cancelado.
    data.status = StatusLembrete.PENDENTE;
    data.concluidoEm = null;
  }

  // Concluir / cancelar.
  if (body.status !== undefined) {
    if (body.status === "feito") {
      data.status = StatusLembrete.FEITO;
      data.concluidoEm = new Date();
    } else if (body.status === "cancelar" || body.status === "CANCELADO") {
      data.status = StatusLembrete.CANCELADO;
      data.concluidoEm = new Date();
    } else if (body.status === "pendente" || body.status === "PENDENTE") {
      data.status = StatusLembrete.PENDENTE;
      data.concluidoEm = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  const atualizado = await prisma.lembrete.update({ where: { id }, data });
  getIO()?.emit("lembrete:atualizado", {
    agenteId: lembrete.agenteId,
    leadId: lembrete.leadId,
  });

  return NextResponse.json({ lembrete: atualizado });
}

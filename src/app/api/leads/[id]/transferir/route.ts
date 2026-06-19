// Transfere um cliente para outro vendedor. ADMIN transfere qualquer; vendedor
// transfere apenas os seus. Reatribui dono do lead + negocio aberto e registra
// Atividade(TRANSFERENCIA) "de A para B".
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import {
  StatusNeg,
  AtividadeTipo,
  TipoHistorico,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { agenteId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const destinoId = String(body?.agenteId ?? "");
  if (!destinoId) {
    return NextResponse.json({ erro: "agenteId obrigatorio" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, donoId: true, dono: { select: { nome: true } } },
  });
  if (!lead) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  // Vendedor so transfere os proprios.
  if (!ehAdmin(agente.papel) && lead.donoId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const destino = await prisma.agente.findUnique({
    where: { id: destinoId },
    select: { id: true, nome: true, ativo: true },
  });
  if (!destino || !destino.ativo) {
    return NextResponse.json(
      { erro: "vendedor destino invalido" },
      { status: 400 },
    );
  }

  const negocio = await prisma.negocio.findFirst({
    where: { leadId: id, status: StatusNeg.ABERTO },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });

  const de = lead.dono?.nome ?? "sem dono";
  const descricao = `Transferido de ${de} para ${destino.nome}`;

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data: { donoId: destino.id } });
    if (negocio) {
      await tx.negocio.update({
        where: { id: negocio.id },
        data: { agenteId: destino.id },
      });
      await tx.historicoNegocio.create({
        data: {
          negocioId: negocio.id,
          agenteId: agente.id,
          tipo: TipoHistorico.ATRIBUICAO,
          descricao,
        },
      });
    }
    await tx.atividade.create({
      data: {
        leadId: id,
        negocioId: negocio?.id ?? null,
        agenteId: agente.id,
        tipo: AtividadeTipo.TRANSFERENCIA,
        descricao,
      },
    });
  });

  if (negocio) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: negocio.id,
      etapaId: null,
      motivo: "transferido",
    });
  }

  return NextResponse.json({ ok: true });
}

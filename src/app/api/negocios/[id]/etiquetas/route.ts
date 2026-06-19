// Adiciona uma etiqueta ao lead do negocio (idempotente) + historico.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { TipoHistorico, AtividadeTipo } from "@/generated/prisma/enums";

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

  let body: { etiquetaId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const etiquetaId = String(body?.etiquetaId ?? "");
  if (!etiquetaId) {
    return NextResponse.json({ erro: "etiquetaId obrigatorio" }, { status: 400 });
  }

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: { id: true, leadId: true, agenteId: true },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!podeAcessarNegocio(agente, negocio.agenteId)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const etiqueta = await prisma.etiqueta.findUnique({
    where: { id: etiquetaId },
    select: { id: true, nome: true, cor: true },
  });
  if (!etiqueta) {
    return NextResponse.json({ erro: "etiqueta invalida" }, { status: 400 });
  }

  // Idempotente: ja existe? Nao duplica nem registra historico de novo.
  const ja = await prisma.leadEtiqueta.findUnique({
    where: { leadId_etiquetaId: { leadId: negocio.leadId, etiquetaId } },
  });
  if (!ja) {
    await prisma.$transaction([
      prisma.leadEtiqueta.create({
        data: { leadId: negocio.leadId, etiquetaId },
      }),
      prisma.historicoNegocio.create({
        data: {
          negocioId: negocio.id,
          agenteId: agente.id,
          tipo: TipoHistorico.ETIQUETA,
          descricao: `Etiqueta "${etiqueta.nome}" adicionada`,
        },
      }),
      prisma.atividade.create({
        data: {
          leadId: negocio.leadId,
          negocioId: negocio.id,
          agenteId: agente.id,
          tipo: AtividadeTipo.ETIQUETA,
          descricao: `Etiqueta "${etiqueta.nome}" adicionada`,
        },
      }),
    ]);
  }

  return NextResponse.json({ etiqueta });
}

// Historico do CLIENTE (timeline de Atividade, desc). Admin ou dono do lead.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, donoId: true },
  });
  if (!lead) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!ehAdmin(agente.papel) && lead.donoId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const atividades = await prisma.atividade.findMany({
    where: { leadId: id },
    orderBy: { criadoEm: "desc" },
    include: { agente: { select: { nome: true } } },
    take: 200,
  });

  return NextResponse.json({
    atividades: atividades.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      descricao: a.descricao,
      agente: a.agente?.nome ?? null,
      criadoEm: a.criadoEm,
    })),
  });
}

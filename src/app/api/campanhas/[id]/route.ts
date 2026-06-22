// Detalhe de uma campanha (GET, com destinos) e cancelamento (PATCH). Dono ou
// admin. Admin pode ver/cancelar qualquer campanha.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import { getIO } from "@/lib/socket";
import { StatusCampanha } from "@/generated/prisma/enums";

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

  const campanha = await prisma.campanha.findUnique({
    where: { id },
    select: {
      id: true,
      agenteId: true,
      finalidade: true,
      canal: true,
      assunto: true,
      mensagem: true,
      valoresJson: true,
      filtroJson: true,
      total: true,
      enviados: true,
      falhas: true,
      pulados: true,
      status: true,
      criadoEm: true,
      iniciadoEm: true,
      concluidoEm: true,
      agente: { select: { id: true, nome: true } },
      destinos: {
        orderBy: { status: "asc" },
        select: {
          id: true,
          destino: true,
          status: true,
          erro: true,
          mensagem: true,
          enviadoEm: true,
          lead: {
            select: {
              id: true,
              nome: true,
              pushName: true,
              nomeManual: true,
              telefone: true,
            },
          },
        },
      },
    },
  });
  if (!campanha) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (!ehAdmin(agente.papel) && campanha.agenteId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  return NextResponse.json({
    campanha: {
      ...campanha,
      destinos: campanha.destinos.map((d) => ({
        id: d.id,
        destino: d.destino,
        status: d.status,
        erro: d.erro,
        mensagem: d.mensagem,
        enviadoEm: d.enviadoEm,
        leadId: d.lead.id,
        nomeEfetivo: nomeEfetivo(d.lead),
      })),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const campanha = await prisma.campanha.findUnique({
    where: { id },
    select: { id: true, agenteId: true, status: true },
  });
  if (!campanha) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (!ehAdmin(agente.papel) && campanha.agenteId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  if (body.status === "cancelar" || body.status === "CANCELADA") {
    if (
      campanha.status === StatusCampanha.CONCLUIDA ||
      campanha.status === StatusCampanha.CANCELADA
    ) {
      return NextResponse.json(
        { erro: "campanha ja finalizada" },
        { status: 422 },
      );
    }
    const atualizada = await prisma.campanha.update({
      where: { id },
      data: { status: StatusCampanha.CANCELADA, concluidoEm: new Date() },
      select: { id: true, status: true },
    });
    getIO()?.emit("campanha:concluida", { campanhaId: id });
    return NextResponse.json({ campanha: atualizada });
  }

  return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
}

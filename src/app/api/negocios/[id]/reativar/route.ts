// Reativa um negocio PERDIDO: volta para ABERTO na primeira etapa aberta do
// funil da finalidade, temperatura MORNO, limpa o motivo de perda do negocio
// ATIVO (preservando-o no historico) e registra a reativacao. Gate: dono do
// negocio, dono do cliente ou admin.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { primeiraEtapaAberta } from "@/lib/negocio";
import { includeCard, cardNegocio } from "@/lib/serializar";
import { rotuloMotivo } from "@/lib/motivosPerda";
import { getIO } from "@/lib/socket";
import {
  StatusNeg,
  Temperatura,
  TipoHistorico,
  AtividadeTipo,
  Finalidade,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      leadId: true,
      agenteId: true,
      status: true,
      finalidade: true,
      motivoPerda: true,
      motivoPerdaObs: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }

  // Gate: admin / dono do negocio / dono do cliente (da finalidade).
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  if (negocio.status !== StatusNeg.PERDIDO) {
    return NextResponse.json(
      { erro: "so e possivel reativar um negocio perdido" },
      { status: 422 },
    );
  }

  const etapa = await primeiraEtapaAberta(negocio.finalidade);
  if (!etapa) {
    return NextResponse.json(
      { erro: "funil sem etapa aberta para reativar" },
      { status: 422 },
    );
  }

  // Preserva o motivo de perda anterior no texto do historico.
  const motivoAnterior = negocio.motivoPerda
    ? rotuloMotivo(negocio.motivoPerda)
    : null;
  const detalhePerda = motivoAnterior
    ? ` (perda anterior: ${motivoAnterior}${
        negocio.motivoPerdaObs ? ` — ${negocio.motivoPerdaObs}` : ""
      })`
    : "";
  const descricao = `Negocio reativado${detalhePerda}`;
  const agora = new Date();

  const atualizado = await prisma.negocio.update({
    where: { id },
    data: {
      status: StatusNeg.ABERTO,
      etapaId: etapa.id,
      entrouEtapaEm: agora,
      fechadoEm: null,
      temperatura: Temperatura.MORNO,
      // Limpa o motivo do negocio ATIVO (preservado acima no historico).
      motivoPerda: null,
      motivoPerdaObs: null,
      historicos: {
        create: {
          tipo: TipoHistorico.ETAPA,
          descricao,
          agenteId: agente.id,
        },
      },
    },
    include: includeCard,
  });

  // Espelha na linha do tempo do cliente, com quem reativou.
  await prisma.atividade.create({
    data: {
      leadId: negocio.leadId,
      negocioId: negocio.id,
      agenteId: agente.id,
      tipo: AtividadeTipo.ETAPA,
      descricao: `Negocio reativado por ${agente.nome ?? "colaborador"}${detalhePerda}`,
    },
  });

  const card = cardNegocio(atualizado);
  getIO()?.emit("negocio:atualizado", {
    negocioId: card.id,
    etapaId: card.etapaId,
    motivo: "reativado",
  });

  return NextResponse.json({ negocio: card });
}

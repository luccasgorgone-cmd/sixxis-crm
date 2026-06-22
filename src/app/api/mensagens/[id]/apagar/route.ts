// Apagar "para todos" uma mensagem OUT ja enviada (revoke via Evolution). Em
// sucesso, marca a Mensagem como apagada (apagadaPor=COLABORADOR) SEM remover o
// conteudo, e registra Atividade(MENSAGEM_APAGADA). Auditavel pelo admin.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { revogarMensagem } from "@/lib/evolution";
import { getIO } from "@/lib/socket";
import { AtividadeTipo, DirecaoMsg } from "@/generated/prisma/enums";

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

  const msg = await prisma.mensagem.findUnique({
    where: { id },
    select: {
      id: true,
      externalId: true,
      direcao: true,
      apagada: true,
      conteudo: true,
      conversa: {
        select: {
          id: true,
          agenteId: true,
          instancia: true,
          instanciaRef: { select: { instanciaEvolution: true } },
          lead: {
            select: { id: true, telefone: true, donoId: true, donoPosVendaId: true },
          },
        },
      },
    },
  });
  if (!msg) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (msg.direcao !== DirecaoMsg.OUT) {
    return NextResponse.json(
      { erro: "so e possivel apagar mensagens enviadas por voce" },
      { status: 422 },
    );
  }
  if (msg.apagada) {
    return NextResponse.json({ ok: true, jaApagada: true });
  }

  // Permissao: dono da conversa, dono do cliente ou admin.
  const lead = msg.conversa.lead;
  const pode =
    ehAdmin(agente.papel) ||
    msg.conversa.agenteId === agente.id ||
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id;
  if (!pode) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // Sem id real do WhatsApp (ex.: envio que falhou) nao da para revogar.
  if (!msg.externalId || msg.externalId.startsWith("out-")) {
    return NextResponse.json(
      { erro: "esta mensagem nao pode ser revogada" },
      { status: 422 },
    );
  }

  const numero = lead.telefone.replace(/\D/g, "");
  const remoteJid = `${numero}@s.whatsapp.net`;
  const instancia =
    msg.conversa.instanciaRef?.instanciaEvolution ?? msg.conversa.instancia ?? null;

  const resultado = await revogarMensagem(instancia, {
    id: msg.externalId,
    remoteJid,
    fromMe: true,
  });
  if (!resultado.ok) {
    return NextResponse.json(
      { erro: "nao foi possivel apagar no WhatsApp" },
      { status: 502 },
    );
  }

  const agora = new Date();
  await prisma.mensagem.update({
    where: { id },
    data: {
      apagada: true,
      apagadaEm: agora,
      apagadaPor: "COLABORADOR",
      apagadaPorId: agente.id,
    },
  });

  await prisma.atividade.create({
    data: {
      leadId: lead.id,
      agenteId: agente.id,
      tipo: AtividadeTipo.MENSAGEM_APAGADA,
      descricao: `Mensagem apagada para o cliente por ${agente.nome ?? "colaborador"}`,
    },
  });

  getIO()?.emit("mensagem:apagada", {
    conversaId: msg.conversa.id,
    mensagemId: id,
    apagadaPor: "COLABORADOR",
  });

  return NextResponse.json({ ok: true });
}

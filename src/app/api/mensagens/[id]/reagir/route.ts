// Reagir a uma mensagem com emoji (como no WhatsApp). Envia a reacao via Evolution
// (sendReaction) e grava em Mensagem.reacao. TOGGLE: reagir com o mesmo emoji de
// novo remove (envia reacao vazia ""). Escopo: dono da conversa/cliente ou admin.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { enviarReacao } from "@/lib/evolution";
import { getIO } from "@/lib/socket";
import { DirecaoMsg } from "@/generated/prisma/enums";

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

  let body: { emoji?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
  // Emoji curto (evita abuso). Vazio nao e aceito na entrada — a remocao e via
  // toggle (reagir com o mesmo emoji ja aplicado).
  if (!emoji || emoji.length > 16) {
    return NextResponse.json({ erro: "emoji invalido" }, { status: 400 });
  }

  const msg = await prisma.mensagem.findUnique({
    where: { id },
    select: {
      id: true,
      externalId: true,
      direcao: true,
      reacao: true,
      apagada: true,
      conversa: {
        select: {
          id: true,
          agenteId: true,
          instancia: true,
          instanciaRef: { select: { instanciaEvolution: true } },
          lead: { select: { telefone: true, donoId: true, donoPosVendaId: true } },
        },
      },
    },
  });
  if (!msg) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }

  // ESCOPO: dono da conversa, dono do cliente (venda/pos) ou admin.
  const lead = msg.conversa.lead;
  const pode =
    ehAdmin(agente.papel) ||
    msg.conversa.agenteId === agente.id ||
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id;
  if (!pode) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // Sem id real do WhatsApp (envio que falhou) nao da para reagir.
  if (!msg.externalId || msg.externalId.startsWith("out-")) {
    return NextResponse.json(
      { erro: "esta mensagem nao pode receber reacao" },
      { status: 422 },
    );
  }

  const remover = msg.reacao === emoji; // mesmo emoji -> toggle (remove)
  const enviado = remover ? "" : emoji;

  const numero = lead.telefone.replace(/\D/g, "");
  const remoteJid = `${numero}@s.whatsapp.net`;
  const instancia =
    msg.conversa.instanciaRef?.instanciaEvolution ?? msg.conversa.instancia ?? null;

  const resultado = await enviarReacao(
    instancia,
    { id: msg.externalId, remoteJid, fromMe: msg.direcao === DirecaoMsg.OUT },
    enviado,
  );
  if (!resultado.ok) {
    return NextResponse.json(
      { erro: "nao foi possivel reagir no WhatsApp" },
      { status: 502 },
    );
  }

  const novaReacao = remover ? null : emoji;
  await prisma.mensagem.update({
    where: { id },
    data: { reacao: novaReacao },
  });

  getIO()?.emit("mensagem:reacao", {
    conversaId: msg.conversa.id,
    mensagemId: id,
    reacao: novaReacao,
  });

  return NextResponse.json({ ok: true, reacao: novaReacao });
}

// Editar uma mensagem OUT ja enviada (estilo WhatsApp) via Evolution updateMessage.
// Espelha o padrao do apagar: externalId + escopo (autor/dono/admin). Regras: so
// mensagens NOSSAS (OUT), so TEXTO, nao apagada, e dentro da janela do WhatsApp
// (~15 min). Em sucesso, atualiza o conteudo, marca editada e guarda o original.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { editarMensagem } from "@/lib/evolution";
import { getIO } from "@/lib/socket";
import { DirecaoMsg, TipoMsg } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Janela de edicao do WhatsApp: ~15 minutos apos o envio.
const JANELA_EDICAO_MS = 15 * 60 * 1000;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { texto?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  if (!texto) {
    return NextResponse.json({ erro: "texto obrigatorio" }, { status: 400 });
  }

  const msg = await prisma.mensagem.findUnique({
    where: { id },
    select: {
      id: true,
      externalId: true,
      direcao: true,
      tipo: true,
      conteudo: true,
      conteudoOriginal: true,
      apagada: true,
      hora: true,
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
      { erro: "so e possivel editar mensagens enviadas por voce" },
      { status: 422 },
    );
  }
  if (msg.tipo !== TipoMsg.TEXTO) {
    return NextResponse.json(
      { erro: "so mensagens de texto podem ser editadas" },
      { status: 422 },
    );
  }
  if (msg.apagada) {
    return NextResponse.json(
      { erro: "mensagem apagada nao pode ser editada" },
      { status: 422 },
    );
  }

  // Permissao: dono da conversa, dono do cliente ou admin (igual ao apagar).
  const lead = msg.conversa.lead;
  const pode =
    ehAdmin(agente.papel) ||
    msg.conversa.agenteId === agente.id ||
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id;
  if (!pode) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // Sem id real do WhatsApp (ex.: envio que falhou) nao da para editar.
  if (!msg.externalId || msg.externalId.startsWith("out-")) {
    return NextResponse.json(
      { erro: "esta mensagem nao pode ser editada" },
      { status: 422 },
    );
  }

  // Janela de edicao (~15 min). Passou -> erro amigavel.
  if (Date.now() - new Date(msg.hora).getTime() > JANELA_EDICAO_MS) {
    return NextResponse.json(
      { erro: "prazo de edicao expirado (ate 15 min apos o envio)" },
      { status: 422 },
    );
  }

  // Sem mudanca de texto: nada a fazer.
  if ((msg.conteudo ?? "").trim() === texto) {
    return NextResponse.json({ ok: true, semMudanca: true });
  }

  const numero = lead.telefone.replace(/\D/g, "");
  const remoteJid = `${numero}@s.whatsapp.net`;
  const instancia =
    msg.conversa.instanciaRef?.instanciaEvolution ?? msg.conversa.instancia ?? null;

  const resultado = await editarMensagem(
    instancia,
    numero,
    { id: msg.externalId, remoteJid, fromMe: true },
    texto,
  );
  if (!resultado.ok) {
    return NextResponse.json(
      { erro: "nao foi possivel editar no WhatsApp" },
      { status: 502 },
    );
  }

  const agora = new Date();
  await prisma.mensagem.update({
    where: { id },
    data: {
      conteudo: texto,
      editada: true,
      editadaEm: agora,
      // Guarda o PRIMEIRO texto (nao sobrescreve em edicoes seguintes).
      ...(msg.conteudoOriginal ? {} : { conteudoOriginal: msg.conteudo ?? "" }),
    },
  });

  getIO()?.emit("mensagem:editada", {
    conversaId: msg.conversa.id,
    mensagemId: id,
    conteudo: texto,
  });

  return NextResponse.json({ ok: true, conteudo: texto });
}

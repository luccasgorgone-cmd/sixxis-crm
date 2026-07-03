// Envio de FIGURINHA (sticker) outbound pelo WhatsApp via Evolution. Recebe
// { conversaId, figurinhaId, instanciaId? }. Envia a figurinha (URL do R2) via
// enviarFigurinha (sticker com fallback para imagem), grava a Mensagem OUT
// (IMAGEM, conteudo "[figurinha]") na conversa unificada e emite em tempo real.
// Erro na Evolution nao derruba a rota: grava ERRO e retorna 502.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarFigurinha } from "@/lib/evolution";
import { DirecaoMsg, TipoMsg, StatusEnvio, Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const agenteId = session.user.id;

  let body: { conversaId?: string; figurinhaId?: string; instanciaId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const conversaId = String(body.conversaId ?? "");
  const figurinhaId = String(body.figurinhaId ?? "");
  const instanciaIdEscolhida = body.instanciaId ? String(body.instanciaId) : null;
  if (!conversaId || !figurinhaId) {
    return NextResponse.json(
      { erro: "conversaId e figurinhaId sao obrigatorios" },
      { status: 400 },
    );
  }

  const figurinha = await prisma.figurinhaSixxis.findUnique({
    where: { id: figurinhaId },
    select: { url: true, ativo: true },
  });
  if (!figurinha || !figurinha.ativo) {
    return NextResponse.json({ erro: "figurinha indisponivel" }, { status: 404 });
  }

  const conversa = await prisma.conversa.findUnique({
    where: { id: conversaId },
    include: {
      lead: { select: { id: true, nome: true, telefone: true } },
      instanciaRef: { select: { instanciaEvolution: true } },
    },
  });
  if (!conversa) {
    return NextResponse.json({ erro: "conversa nao encontrada" }, { status: 404 });
  }

  const numero = conversa.lead.telefone.replace(/\D/g, "");
  if (!numero) {
    return NextResponse.json({ erro: "lead sem telefone valido" }, { status: 422 });
  }

  // Numero de envio: padrao da conversa ou o escolhido (ativo e da finalidade).
  let instanciaEvolution =
    conversa.instanciaRef?.instanciaEvolution ?? conversa.instancia ?? null;
  let instanciaIdUsada: string | null = conversa.instanciaId;
  if (instanciaIdEscolhida) {
    const escolhida = await prisma.instanciaWhatsApp.findFirst({
      where: {
        id: instanciaIdEscolhida,
        ativo: true,
        finalidade: conversa.finalidade,
      },
      select: { id: true, instanciaEvolution: true },
    });
    if (escolhida) {
      instanciaEvolution = escolhida.instanciaEvolution;
      instanciaIdUsada = escolhida.id;
    }
  }

  const resultado = await enviarFigurinha(numero, figurinha.url, instanciaEvolution);
  const status: StatusEnvio = resultado.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO;
  const externalId = resultado.externalId ?? `out-${randomUUID()}`;
  const agora = new Date();

  const dados = {
    conversaId: conversa.id,
    direcao: DirecaoMsg.OUT,
    tipo: TipoMsg.IMAGEM,
    conteudo: "[figurinha]",
    mediaUrl: figurinha.url,
    instancia: instanciaEvolution,
    instanciaId: instanciaIdUsada,
    statusEnvio: status,
    lida: true,
    raw: (resultado.raw ?? {}) as Prisma.InputJsonValue,
    hora: agora,
  };

  let mensagem;
  try {
    mensagem = await prisma.mensagem.create({ data: { externalId, ...dados } });
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      mensagem = await prisma.mensagem.create({
        data: { externalId: `out-${randomUUID()}`, ...dados },
      });
    } else {
      throw erro;
    }
  }

  await prisma.conversa.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: agora,
      ...(conversa.agenteId ? {} : { agenteId }),
    },
  });

  const payloadMsg = {
    id: mensagem.id,
    direcao: mensagem.direcao,
    tipo: mensagem.tipo,
    conteudo: mensagem.conteudo,
    mediaUrl: mensagem.mediaUrl,
    statusEnvio: mensagem.statusEnvio,
    hora: mensagem.hora,
  };

  getIO()?.emit("mensagem:nova", {
    leadId: conversa.lead.id,
    leadNome: conversa.lead.nome,
    leadTelefone: numero,
    conversaId: conversa.id,
    mensagemId: mensagem.id,
    direcao: mensagem.direcao,
    tipo: mensagem.tipo,
    conteudo: mensagem.conteudo,
    mediaUrl: mensagem.mediaUrl,
    statusEnvio: mensagem.statusEnvio,
    hora: mensagem.hora,
    naoLidas: 0,
    ultimaMensagemEm: agora,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, erro: "falha ao enviar figurinha na Evolution", mensagem: payloadMsg },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, mensagem: payloadMsg });
}

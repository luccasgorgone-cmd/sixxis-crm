// Encaminhar (forward) uma mensagem para OUTRA conversa: reenvia o conteudo
// (texto / midia via URL do R2 / contato) ao destino pelo mesmo padrao de envio.
// A Evolution nao tem forward nativo confiavel; reenviar o conteudo tem o mesmo
// efeito para o cliente. Fatia 2.85.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import {
  enviarTexto,
  enviarMidia,
  enviarAudio,
  enviarContato,
} from "@/lib/evolution";
import { DirecaoMsg, TipoMsg, StatusEnvio, Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ehUrlRenderavel(url?: string | null): boolean {
  if (!url) return false;
  return !/whatsapp\.net/i.test(url) && !/\.enc(\?|#|$)/i.test(url);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const agenteId = session.user.id;

  let body: { mensagemId?: string; conversaDestinoId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const mensagemId = String(body.mensagemId ?? "");
  const conversaDestinoId = String(body.conversaDestinoId ?? "");
  if (!mensagemId || !conversaDestinoId) {
    return NextResponse.json(
      { erro: "mensagemId e conversaDestinoId sao obrigatorios" },
      { status: 400 },
    );
  }

  const origem = await prisma.mensagem.findUnique({
    where: { id: mensagemId },
    select: {
      tipo: true,
      conteudo: true,
      mediaUrl: true,
      contatoNome: true,
      contatoTelefone: true,
    },
  });
  if (!origem) {
    return NextResponse.json({ erro: "mensagem nao encontrada" }, { status: 404 });
  }

  const conversa = await prisma.conversa.findUnique({
    where: { id: conversaDestinoId },
    include: {
      lead: { select: { id: true, nome: true, telefone: true } },
      instanciaRef: { select: { instanciaEvolution: true } },
    },
  });
  if (!conversa) {
    return NextResponse.json({ erro: "conversa destino nao encontrada" }, { status: 404 });
  }
  const numero = conversa.lead.telefone.replace(/\D/g, "");
  if (!numero) {
    return NextResponse.json({ erro: "destino sem telefone valido" }, { status: 422 });
  }
  const instancia =
    conversa.instanciaRef?.instanciaEvolution ?? conversa.instancia ?? null;

  // Reenvia o conteudo pelo canal certo.
  let resultado;
  if (origem.contatoNome && origem.contatoTelefone) {
    resultado = await enviarContato(numero, instancia, {
      nome: origem.contatoNome,
      telefone: origem.contatoTelefone,
    });
  } else if (origem.tipo === TipoMsg.TEXTO) {
    resultado = await enviarTexto(numero, origem.conteudo ?? "", instancia);
  } else if (
    (origem.tipo === TipoMsg.IMAGEM ||
      origem.tipo === TipoMsg.VIDEO ||
      origem.tipo === TipoMsg.DOCUMENTO) &&
    ehUrlRenderavel(origem.mediaUrl)
  ) {
    const mediatype =
      origem.tipo === TipoMsg.IMAGEM
        ? "image"
        : origem.tipo === TipoMsg.VIDEO
          ? "video"
          : "document";
    resultado = await enviarMidia(numero, origem.mediaUrl!, mediatype, instancia);
  } else if (origem.tipo === TipoMsg.AUDIO && ehUrlRenderavel(origem.mediaUrl)) {
    resultado = await enviarAudio(numero, origem.mediaUrl!, instancia);
  } else {
    return NextResponse.json(
      { erro: "esta mensagem nao pode ser encaminhada" },
      { status: 422 },
    );
  }

  const status: StatusEnvio = resultado.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO;
  const externalId = resultado.externalId ?? `out-${randomUUID()}`;
  const agora = new Date();

  const dados = {
    conversaId: conversa.id,
    direcao: DirecaoMsg.OUT,
    tipo: origem.tipo,
    conteudo: origem.conteudo,
    ...(origem.mediaUrl ? { mediaUrl: origem.mediaUrl } : {}),
    ...(origem.contatoNome
      ? { contatoNome: origem.contatoNome, contatoTelefone: origem.contatoTelefone }
      : {}),
    instancia,
    instanciaId: conversa.instanciaId,
    statusEnvio: status,
    lida: true,
    raw: (resultado.raw ?? {}) as Prisma.InputJsonValue,
    hora: agora,
  };

  let mensagem;
  try {
    mensagem = await prisma.mensagem.create({ data: { externalId, ...dados } });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
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
      { ok: false, erro: "falha ao encaminhar" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}

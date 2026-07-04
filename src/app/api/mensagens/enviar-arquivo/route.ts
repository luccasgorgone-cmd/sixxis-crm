// Envio de ARQUIVO GERAL outbound pelo WhatsApp via Evolution: imagem, video,
// audio, PDF/documento. Recebe multipart/form-data (campo "arquivo") + conversaId
// e, opcionalmente, instanciaId (numero de envio). Detecta o tipo pelo MIME:
//   image/*  -> enviarMidia "image"  (Mensagem IMAGEM)
//   video/*  -> enviarMidia "video"  (Mensagem VIDEO)
//   audio/*  -> enviarAudio          (Mensagem AUDIO)
//   outros   -> enviarMidia "document" com fileName preservado (Mensagem DOCUMENTO)
// Fluxo: sobe ao R2 (permanente), chama a Evolution, grava a Mensagem OUT (dedup
// por externalId), atualiza a conversa e emite mensagem:nova. Espelha o padrao do
// enviar-audio (nao regride o envio de audio/mensagens existentes).
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarAudio, enviarMidia } from "@/lib/evolution";
import { enviarParaR2ComRetry, extensaoDoMime } from "@/lib/r2";
import {
  DirecaoMsg,
  TipoMsg,
  StatusEnvio,
  Prisma,
} from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Limites (folga profissional, dentro do WhatsApp): ~64MB midia (imagem/video/
// audio), ~100MB documento. Fatia 2.85.
const LIMITE_MIDIA = 64 * 1024 * 1024;
const LIMITE_DOC = 100 * 1024 * 1024;

// Classifica o arquivo pelo MIME para escolher o envio e o tipo da Mensagem.
function classificar(
  mime: string,
): { midia: "image" | "video" | "document" | "audio"; tipo: TipoMsg } {
  if (mime.startsWith("image/")) return { midia: "image", tipo: TipoMsg.IMAGEM };
  if (mime.startsWith("video/")) return { midia: "video", tipo: TipoMsg.VIDEO };
  if (mime.startsWith("audio/")) return { midia: "audio", tipo: TipoMsg.AUDIO };
  return { midia: "document", tipo: TipoMsg.DOCUMENTO };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const agenteId = session.user.id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const conversaId = String(form.get("conversaId") ?? "");
  const instanciaIdEscolhida = form.get("instanciaId")
    ? String(form.get("instanciaId"))
    : null;
  // Legenda opcional (caption estilo WhatsApp) para imagem/video.
  const legenda = String(form.get("legenda") ?? "").trim();
  const arquivo = form.get("arquivo");
  if (!conversaId || !(arquivo instanceof Blob)) {
    return NextResponse.json(
      { erro: "conversaId e arquivo sao obrigatorios" },
      { status: 400 },
    );
  }

  const mime = arquivo.type || "application/octet-stream";
  const { midia, tipo } = classificar(mime);
  const ehDocumento = midia === "document";
  const limite = ehDocumento ? LIMITE_DOC : LIMITE_MIDIA;
  if (arquivo.size > limite) {
    return NextResponse.json(
      {
        erro: `Arquivo muito grande. Maximo ${ehDocumento ? "100MB" : "64MB"}.`,
      },
      { status: 413 },
    );
  }
  const nomeArquivo =
    arquivo instanceof File && arquivo.name ? arquivo.name : "arquivo";

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
        // Mesma finalidade OU a instancia que a conversa ja usa (numero do cliente
        // sempre valido, mesmo apos mover finalidade). Fatia 2.84.
        OR: [
          { finalidade: conversa.finalidade },
          ...(conversa.instanciaId ? [{ id: conversa.instanciaId }] : []),
        ],
      },
      select: { id: true, instanciaEvolution: true },
    });
    if (escolhida) {
      instanciaEvolution = escolhida.instanciaEvolution;
      instanciaIdUsada = escolhida.id;
    }
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const base64 = buffer.toString("base64");

  // Sobe ao R2 (permanente) com RETRY; so cai no base64 se o R2 falhar de vez.
  const ext = extensaoDoMime(mime);
  const chave = `whatsapp/${numero}/out-${randomUUID()}.${ext}`;
  const mediaUrl = await enviarParaR2ComRetry(chave, buffer, mime);
  const midiaParaEnviar = mediaUrl ?? base64;

  // Legenda (caption) so faz sentido em imagem/video.
  const temCaption = !!legenda && (midia === "image" || midia === "video");

  // Envia pelo canal certo. Documento preserva o nome do arquivo (filename);
  // imagem/video levam a legenda como caption (estilo WhatsApp).
  const resultado =
    midia === "audio"
      ? await enviarAudio(numero, midiaParaEnviar, instanciaEvolution)
      : await enviarMidia(numero, midiaParaEnviar, midia, instanciaEvolution, {
          mimetype: mime,
          ...(ehDocumento ? { fileName: nomeArquivo } : {}),
          ...(temCaption ? { caption: legenda } : {}),
        });

  const status: StatusEnvio = resultado.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO;
  const externalId = resultado.externalId ?? `out-${randomUUID()}`;
  const agora = new Date();

  // Conteudo: placeholder por tipo de midia; documento guarda o NOME do arquivo
  // (o thread mostra o nome no link de download).
  // Imagem/video com legenda guardam a legenda como conteudo (o thread mostra
  // como caption); documento guarda o NOME do arquivo; demais, placeholder.
  const conteudo =
    tipo === TipoMsg.DOCUMENTO
      ? nomeArquivo
      : temCaption
        ? legenda
        : tipo === TipoMsg.IMAGEM
          ? "[imagem]"
          : tipo === TipoMsg.VIDEO
            ? "[video]"
            : "[audio]";

  const dados = {
    conversaId: conversa.id,
    direcao: DirecaoMsg.OUT,
    tipo,
    conteudo,
    mediaUrl,
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
      { ok: false, erro: "falha ao enviar arquivo na Evolution", mensagem: payloadMsg },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, mensagem: payloadMsg });
}

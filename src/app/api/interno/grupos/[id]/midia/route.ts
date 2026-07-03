// Envia MIDIA (imagem/video/audio/arquivo) para um grupo interno. Sobe ao R2
// (mesmo bucket do inbox de clientes), envia ao grupo via Evolution e grava
// MensagemGrupo OUT com mediaUrl. ISOLADO — nao toca Lead/Conversa/metricas.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarMidia, enviarAudio } from "@/lib/evolution";
import { enviarParaR2, extensaoDoMime, r2Configurado } from "@/lib/r2";
import { DirecaoMsg, TipoMsg } from "@/generated/prisma/enums";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MB = 1024 * 1024;

// Classifica pelo mime: tipo interno, mediatype da Evolution e limite de tamanho.
function classificar(mime: string): {
  tipo: TipoMsg;
  mediatype: "image" | "video" | "document" | "audio";
  limite: number;
} {
  if (mime.startsWith("image/"))
    return { tipo: TipoMsg.IMAGEM, mediatype: "image", limite: 10 * MB };
  if (mime.startsWith("video/"))
    return { tipo: TipoMsg.VIDEO, mediatype: "video", limite: 50 * MB };
  if (mime.startsWith("audio/"))
    return { tipo: TipoMsg.AUDIO, mediatype: "audio", limite: 16 * MB };
  return { tipo: TipoMsg.DOCUMENTO, mediatype: "document", limite: 25 * MB };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  if (!r2Configurado()) {
    return NextResponse.json(
      { erro: "armazenamento de midia indisponivel" },
      { status: 503 },
    );
  }

  const grupo = await prisma.grupoInterno.findUnique({
    where: { id },
    select: { id: true, jid: true, instancia: true },
  });
  if (!grupo) {
    return NextResponse.json({ erro: "grupo nao encontrado" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ erro: "arquivo ausente" }, { status: 400 });
  }
  const legenda =
    typeof form.get("legenda") === "string"
      ? (form.get("legenda") as string).trim()
      : "";

  const mime = arquivo.type || "application/octet-stream";
  const { tipo, mediatype, limite } = classificar(mime);
  if (arquivo.size > limite) {
    return NextResponse.json(
      { erro: `arquivo excede o limite (${Math.round(limite / MB)}MB)` },
      { status: 413 },
    );
  }

  // Sobe ao R2.
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const ext = extensaoDoMime(mime);
  const jidSeguro = grupo.jid.replace(/[^a-zA-Z0-9_-]/g, "_");
  const chave = `whatsapp/${jidSeguro}/out-${randomUUID()}.${ext}`;
  const url = await enviarParaR2(chave, buffer, mime);
  if (!url) {
    return NextResponse.json(
      { erro: "falha ao subir a midia" },
      { status: 502 },
    );
  }

  // Envia ao grupo via Evolution (audio como voz/PTT; resto como sendMedia).
  const nomeArquivo = arquivo.name || `arquivo.${ext}`;
  const r =
    mediatype === "audio"
      ? await enviarAudio(grupo.jid, url, grupo.instancia)
      : await enviarMidia(grupo.jid, url, mediatype, grupo.instancia, {
          fileName: nomeArquivo,
          caption: legenda || undefined,
          mimetype: mime,
        });
  if (!r.ok) {
    return NextResponse.json(
      { erro: "falha ao enviar midia ao grupo" },
      { status: 502 },
    );
  }

  const hora = new Date();
  const dados = {
    grupoId: grupo.id,
    autorJid: null,
    autorNome: agente.nome ?? "Equipe",
    direcao: DirecaoMsg.OUT,
    tipo,
    conteudo: legenda || (tipo === TipoMsg.DOCUMENTO ? nomeArquivo : null),
    mediaUrl: url,
    hora,
  };
  let msg;
  try {
    msg = await prisma.mensagemGrupo.create({
      data: { externalId: r.externalId ?? `out-grupo-${randomUUID()}`, ...dados },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      msg = await prisma.mensagemGrupo.create({
        data: { externalId: `out-grupo-${randomUUID()}`, ...dados },
      });
    } else {
      throw e;
    }
  }

  await prisma.grupoInterno.update({
    where: { id: grupo.id },
    data: { ultimaMensagemEm: hora },
  });

  getIO()?.emit("grupo:mensagem", {
    grupoId: grupo.id,
    jid: grupo.jid,
    mensagemId: msg.id,
    direcao: msg.direcao,
    tipo: msg.tipo,
    conteudo: msg.conteudo,
    autorNome: msg.autorNome,
    hora: msg.hora,
    ultimaMensagemEm: hora,
  });

  return NextResponse.json({ mensagem: msg });
}

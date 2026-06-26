// Envio de mensagem de VOZ (audio/PTT) outbound pelo WhatsApp via Evolution.
// Recebe o audio como multipart/form-data (campo "audio") + conversaId e,
// opcionalmente, instanciaId (numero de envio escolhido). Fluxo: sobe o audio
// ao R2 (reusa lib/r2.ts), chama enviarAudio, grava a Mensagem AUDIO OUT na
// conversa unificada e emite o evento em tempo real. Erro na Evolution nao
// derruba a rota: grava ERRO e retorna 502.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarAudio } from "@/lib/evolution";
import { enviarParaR2, extensaoDoMime } from "@/lib/r2";
import {
  DirecaoMsg,
  TipoMsg,
  StatusEnvio,
  Prisma,
} from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const arquivo = form.get("audio");
  if (!conversaId || !(arquivo instanceof Blob)) {
    return NextResponse.json(
      { erro: "conversaId e audio sao obrigatorios" },
      { status: 400 },
    );
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

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const mime = arquivo.type || "audio/ogg";
  const base64 = buffer.toString("base64");

  // Sobe ao R2 (permanente); fallback degradado: sem R2, fica sem mediaUrl mas
  // o audio ainda e enviado via base64 a Evolution.
  const ext = extensaoDoMime(mime);
  const chave = `whatsapp/${numero}/out-${randomUUID()}.${ext}`;
  const mediaUrl = await enviarParaR2(chave, buffer, mime);

  // Chama a Evolution com a URL publica (se houver) ou o base64.
  const resultado = await enviarAudio(numero, mediaUrl ?? base64, instanciaEvolution);
  const status: StatusEnvio = resultado.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO;
  const externalId = resultado.externalId ?? `out-${randomUUID()}`;
  const agora = new Date();

  let mensagem;
  try {
    mensagem = await prisma.mensagem.create({
      data: {
        externalId,
        conversaId: conversa.id,
        direcao: DirecaoMsg.OUT,
        tipo: TipoMsg.AUDIO,
        conteudo: "[audio]",
        mediaUrl,
        instancia: instanciaEvolution,
        instanciaId: instanciaIdUsada,
        statusEnvio: status,
        lida: true,
        raw: (resultado.raw ?? {}) as Prisma.InputJsonValue,
        hora: agora,
      },
    });
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      mensagem = await prisma.mensagem.create({
        data: {
          externalId: `out-${randomUUID()}`,
          conversaId: conversa.id,
          direcao: DirecaoMsg.OUT,
          tipo: TipoMsg.AUDIO,
          conteudo: "[audio]",
          mediaUrl,
          instancia: instanciaEvolution,
          instanciaId: instanciaIdUsada,
          statusEnvio: status,
          lida: true,
          raw: (resultado.raw ?? {}) as Prisma.InputJsonValue,
          hora: agora,
        },
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
      { ok: false, erro: "falha ao enviar audio na Evolution", mensagem: payloadMsg },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, mensagem: payloadMsg });
}

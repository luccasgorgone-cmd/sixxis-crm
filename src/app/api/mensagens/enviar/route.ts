// Envio de mensagem outbound (OUT) pelo WhatsApp via Evolution.
// Fluxo: resolve o telefone -> chama a Evolution -> grava a Mensagem OUT
// (ENVIADA ou ERRO) -> atualiza a conversa -> emite o evento em tempo real.
// Erro da Evolution NUNCA derruba a rota: grava ERRO e retorna status 502.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarTexto } from "@/lib/evolution";
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

  let body: { conversaId?: string; texto?: string; instanciaId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const conversaId = String(body?.conversaId ?? "");
  const texto = String(body?.texto ?? "").trim();
  const instanciaIdEscolhida = body?.instanciaId
    ? String(body.instanciaId)
    : null;
  if (!conversaId || !texto) {
    return NextResponse.json(
      { erro: "conversaId e texto sao obrigatorios" },
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
    return NextResponse.json(
      { erro: "conversa nao encontrada" },
      { status: 404 },
    );
  }

  const numero = conversa.lead.telefone.replace(/\D/g, "");
  if (!numero) {
    return NextResponse.json(
      { erro: "lead sem telefone valido" },
      { status: 422 },
    );
  }

  // Numero de envio: por padrao o da conversa (ultimo que o cliente usou no
  // setor); ou o escolhido no compositor, desde que ativo e da MESMA finalidade.
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

  // Chama a Evolution. Se falhar, ainda gravamos a mensagem com status ERRO.
  const resultado = await enviarTexto(numero, texto, instanciaEvolution);
  const status: StatusEnvio = resultado.ok
    ? StatusEnvio.ENVIADA
    : StatusEnvio.ERRO;
  const externalId = resultado.externalId ?? `out-${randomUUID()}`;
  const agora = new Date();

  let mensagem;
  try {
    mensagem = await prisma.mensagem.create({
      data: {
        externalId,
        conversaId: conversa.id,
        direcao: DirecaoMsg.OUT,
        tipo: TipoMsg.TEXTO,
        conteudo: texto,
        instancia: instanciaEvolution,
        instanciaId: instanciaIdUsada,
        statusEnvio: status,
        lida: true,
        raw: (resultado.raw ?? {}) as Prisma.InputJsonValue,
        hora: agora,
      },
    });
  } catch (erro) {
    // Colisao improvavel de externalId: tenta de novo com id proprio.
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      mensagem = await prisma.mensagem.create({
        data: {
          externalId: `out-${randomUUID()}`,
          conversaId: conversa.id,
          direcao: DirecaoMsg.OUT,
          tipo: TipoMsg.TEXTO,
          conteudo: texto,
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

  // Atualiza a conversa: ultima atividade e dono (se ainda nao tinha agente).
  await prisma.conversa.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: agora,
      ...(conversa.agenteId ? {} : { agenteId }),
    },
  });

  // Tempo real: a mensagem OUT aparece na thread/lista sem refresh.
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

  const payloadMsg = {
    id: mensagem.id,
    direcao: mensagem.direcao,
    tipo: mensagem.tipo,
    conteudo: mensagem.conteudo,
    mediaUrl: mensagem.mediaUrl,
    statusEnvio: mensagem.statusEnvio,
    hora: mensagem.hora,
  };

  // Sucesso da gravacao, mas falha no envio: 502 para a UI sinalizar o erro.
  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, erro: "falha ao enviar na Evolution", mensagem: payloadMsg },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, mensagem: payloadMsg });
}

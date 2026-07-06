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

  let body: {
    conversaId?: string;
    texto?: string;
    instanciaId?: string;
    respostaAId?: string;
    // Chave idempotente do envio otimista (Fatia 3.11): so trafega de volta no
    // socket para o remetente casar a bolha "tmp-<uuid>". Nao e persistida.
    clientId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const conversaId = String(body?.conversaId ?? "");
  const texto = String(body?.texto ?? "").trim();
  const clientId = body?.clientId ? String(body.clientId) : null;
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

  // Numero de resposta (Fatia 2.89), em ordem:
  //   (1) o escolhido no compositor (pontual) -> tambem PERSISTE como fixado;
  //   (2) o FIXADO na conversa (instanciaRespostaId), se houver;
  //   (3) o padrao: ultimo numero que o cliente usou (conversa.instancia).
  // Assim, o numero escolhido pelo atendente sobrevive a resposta do cliente (que
  // so mexe em conversa.instancia), em vez de "voltar sozinho".
  let instanciaEvolution =
    conversa.instanciaRef?.instanciaEvolution ?? conversa.instancia ?? null;
  let instanciaIdUsada: string | null = conversa.instanciaId;
  let fixarRespostaId: string | null = null;

  // Resolve uma instancia valida (ativa; da finalidade da conversa OU a que a
  // conversa ja usa — o numero do cliente e sempre valido, inclusive apos mover
  // finalidade). Fatia 2.84/2.89.
  async function resolverInstancia(idInstancia: string) {
    return prisma.instanciaWhatsApp.findFirst({
      where: {
        id: idInstancia,
        ativo: true,
        OR: [
          { finalidade: conversa!.finalidade },
          ...(conversa!.instanciaId ? [{ id: conversa!.instanciaId }] : []),
        ],
      },
      select: { id: true, instanciaEvolution: true },
    });
  }

  if (instanciaIdEscolhida) {
    const escolhida = await resolverInstancia(instanciaIdEscolhida);
    if (escolhida) {
      instanciaEvolution = escolhida.instanciaEvolution;
      instanciaIdUsada = escolhida.id;
      // Persiste a escolha do atendente para os proximos envios.
      fixarRespostaId = escolhida.id;
    }
  } else if (conversa.instanciaRespostaId) {
    const fixada = await resolverInstancia(conversa.instanciaRespostaId);
    if (fixada) {
      instanciaEvolution = fixada.instanciaEvolution;
      instanciaIdUsada = fixada.id;
    }
  }

  // Sem numero de envio valido: NAO finge envio (nao grava bolha). Erro claro.
  // Fatia 2.89-C.
  if (!instanciaEvolution) {
    return NextResponse.json(
      { erro: "Nenhum numero de envio valido para esta conversa" },
      { status: 422 },
    );
  }

  // Reply (Fatia 2.85): se responde a uma mensagem DESTA conversa, monta o quoted
  // (key da Evolution) para o WhatsApp exibir como resposta, e guarda respostaAId.
  const respostaAId = body?.respostaAId ? String(body.respostaAId) : null;
  let quoted:
    | { id: string; remoteJid: string; fromMe: boolean }
    | undefined;
  if (respostaAId) {
    const citada = await prisma.mensagem.findUnique({
      where: { id: respostaAId },
      select: { externalId: true, direcao: true, conversaId: true },
    });
    if (
      citada &&
      citada.conversaId === conversa.id &&
      citada.externalId &&
      !citada.externalId.startsWith("out-")
    ) {
      quoted = {
        id: citada.externalId,
        remoteJid: `${numero}@s.whatsapp.net`,
        fromMe: citada.direcao === DirecaoMsg.OUT,
      };
    }
  }

  // Chama a Evolution. Se falhar, ainda gravamos a mensagem com status ERRO.
  const resultado = await enviarTexto(numero, texto, instanciaEvolution, quoted);
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
        ...(respostaAId ? { respostaAId } : {}),
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

  // Atualiza a conversa: ultima atividade, dono (se ainda nao tinha agente) e o
  // numero de resposta FIXADO quando o atendente escolheu um (persiste a escolha).
  await prisma.conversa.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: agora,
      ...(conversa.agenteId ? {} : { agenteId }),
      ...(fixarRespostaId ? { instanciaRespostaId: fixarRespostaId } : {}),
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
    // Devolve o clientId para o remetente reconciliar a bolha otimista (3.11).
    clientId,
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

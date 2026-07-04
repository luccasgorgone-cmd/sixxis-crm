// Envia um CONTATO (vCard) ao cliente pelo WhatsApp via Evolution (sendContact).
// Se a Evolution nao suportar/falhar, degrada para TEXTO formatado (o contato
// ainda chega ao cliente). Grava a Mensagem OUT com os dados estruturados do
// contato (renderiza como card no thread). Fatia 2.85. Espelha o padrao do enviar.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarContato, enviarTexto } from "@/lib/evolution";
import { DirecaoMsg, TipoMsg, StatusEnvio, Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function montarVcard(nome: string, telefone: string): string {
  const dig = telefone.replace(/\D/g, "");
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${nome}`,
    `TEL;type=CELL;waid=${dig}:${telefone}`,
    "END:VCARD",
  ].join("\n");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const agenteId = session.user.id;

  let body: { conversaId?: string; nome?: string; telefone?: string; instanciaId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const conversaId = String(body.conversaId ?? "");
  const nome = String(body.nome ?? "").trim();
  const telefone = String(body.telefone ?? "").trim();
  const instanciaIdEscolhida = body.instanciaId ? String(body.instanciaId) : null;
  if (!conversaId || !nome || !telefone) {
    return NextResponse.json(
      { erro: "conversaId, nome e telefone sao obrigatorios" },
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

  let instanciaEvolution =
    conversa.instanciaRef?.instanciaEvolution ?? conversa.instancia ?? null;
  let instanciaIdUsada: string | null = conversa.instanciaId;
  if (instanciaIdEscolhida) {
    const escolhida = await prisma.instanciaWhatsApp.findFirst({
      where: {
        id: instanciaIdEscolhida,
        ativo: true,
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

  // Tenta sendContact; se falhar, degrada para texto formatado (o contato chega).
  let resultado = await enviarContato(numero, instanciaEvolution, { nome, telefone });
  if (!resultado.ok) {
    resultado = await enviarTexto(
      numero,
      `Contato: ${nome}\n${telefone}`,
      instanciaEvolution,
    );
  }
  const status: StatusEnvio = resultado.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO;
  const externalId = resultado.externalId ?? `out-${randomUUID()}`;
  const agora = new Date();

  const dados = {
    conversaId: conversa.id,
    direcao: DirecaoMsg.OUT,
    tipo: TipoMsg.OUTRO,
    conteudo: `[contato] ${nome}`,
    contatoNome: nome,
    contatoTelefone: telefone,
    contatoVcard: montarVcard(nome, telefone),
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
    contatoNome: mensagem.contatoNome,
    contatoTelefone: mensagem.contatoTelefone,
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
    statusEnvio: mensagem.statusEnvio,
    hora: mensagem.hora,
    naoLidas: 0,
    ultimaMensagemEm: agora,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, erro: "falha ao enviar contato", mensagem: payloadMsg },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, mensagem: payloadMsg });
}

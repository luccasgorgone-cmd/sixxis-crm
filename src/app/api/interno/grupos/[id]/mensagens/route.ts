// Mensagens de um grupo interno (GET historico, POST envia ao grupo).
// ISOLADO do fluxo de clientes: usa MensagemGrupo, jamais Mensagem/Conversa.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarTexto } from "@/lib/evolution";
import { DirecaoMsg, TipoMsg } from "@/generated/prisma/enums";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE = 40;

// Historico cronologico do grupo (paginado por cursor "antesDe" = hora ISO).
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const grupo = await prisma.grupoInterno.findUnique({
    where: { id },
    select: { id: true, jid: true, nome: true, fotoUrl: true, instancia: true },
  });
  if (!grupo) {
    return NextResponse.json({ erro: "grupo nao encontrado" }, { status: 404 });
  }

  const antesDe = req.nextUrl.searchParams.get("antesDe");
  const where: Prisma.MensagemGrupoWhereInput = { grupoId: id };
  if (antesDe) {
    const d = new Date(antesDe);
    if (!Number.isNaN(d.getTime())) where.hora = { lt: d };
  }

  // Busca os mais recentes primeiro (para paginar), depois devolve em ordem.
  const recentes = await prisma.mensagemGrupo.findMany({
    where,
    orderBy: { hora: "desc" },
    take: LIMITE + 1,
    select: {
      id: true,
      direcao: true,
      tipo: true,
      conteudo: true,
      autorJid: true,
      autorNome: true,
      hora: true,
    },
  });
  const temMais = recentes.length > LIMITE;
  const pagina = temMais ? recentes.slice(0, LIMITE) : recentes;
  const mensagens = pagina.reverse();

  return NextResponse.json({
    grupo,
    mensagens,
    temMais,
    proximoCursor: temMais ? pagina[0]?.hora : null,
  });
}

// Envia uma mensagem de texto ao grupo (via enviarTexto com o jid @g.us) e grava
// como MensagemGrupo OUT. NAO cria lead/conversa.
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
    return NextResponse.json({ erro: "texto vazio" }, { status: 400 });
  }

  const grupo = await prisma.grupoInterno.findUnique({
    where: { id },
    select: { id: true, jid: true, instancia: true },
  });
  if (!grupo) {
    return NextResponse.json({ erro: "grupo nao encontrado" }, { status: 404 });
  }

  const r = await enviarTexto(grupo.jid, texto, grupo.instancia);
  if (!r.ok) {
    return NextResponse.json(
      { erro: "falha ao enviar ao grupo" },
      { status: 502 },
    );
  }

  const hora = new Date();
  const dados = {
    grupoId: grupo.id,
    autorJid: null,
    autorNome: agente.nome ?? "Equipe",
    direcao: DirecaoMsg.OUT,
    tipo: TipoMsg.TEXTO,
    conteudo: texto,
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

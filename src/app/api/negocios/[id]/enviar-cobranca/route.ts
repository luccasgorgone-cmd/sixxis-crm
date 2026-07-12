// Envia o LINK de pagamento (Mercado Pago) ao cliente pelo WhatsApp como TEXTO
// (Fase 3 — Bloco 3). Reusa o mesmo padrao do enviar-orcamento: so para o numero
// do cliente que JA tem conversa da finalidade; registra a Mensagem OUT na thread
// (aparece na hora via socket + injecao otimista no front). Escopo dono/admin.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarTexto } from "@/lib/evolution";
import { checarAcessoNegocio } from "@/lib/orcamentoDados";
import { formatarBRL } from "@/lib/format";
import { Finalidade } from "@/generated/prisma/enums";
import { DirecaoMsg, TipoMsg, StatusEnvio, Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;

  const acesso = await checarAcessoNegocio(agente, id);
  if (!acesso.ok) return NextResponse.json({ erro: acesso.erro }, { status: acesso.status });

  // Cobranca MAIS RECENTE do negocio (Fatia A: 1-N; precisa existir — gerar o
  // link primeiro).
  const pagamento = await prisma.pagamento.findFirst({
    where: { negocioId: id },
    orderBy: { criadoEm: "desc" },
    select: { initPoint: true, referencia: true, valor: true },
  });
  if (!pagamento?.initPoint) {
    return NextResponse.json(
      { erro: "Gere o link de pagamento antes de enviar." },
      { status: 422 },
    );
  }

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      leadId: true,
      finalidade: true,
      lead: {
        select: { telefone: true, nome: true, nomeManual: true, pushName: true },
      },
    },
  });
  if (!negocio) return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });

  const numero = (negocio.lead.telefone ?? "").replace(/\D/g, "");
  if (!numero) {
    return NextResponse.json({ erro: "Cliente sem telefone válido." }, { status: 422 });
  }

  const conversa = await prisma.conversa.findFirst({
    where: { leadId: negocio.leadId, finalidade: negocio.finalidade, arquivada: false },
    orderBy: [{ ultimaMensagemEm: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true,
      instancia: true,
      instanciaId: true,
      agenteId: true,
      instanciaRef: { select: { instanciaEvolution: true } },
    },
  });
  if (!conversa) {
    return NextResponse.json(
      { erro: "O cliente ainda não tem conversa nesta finalidade." },
      { status: 422 },
    );
  }

  const instanciaEvolution =
    conversa.instanciaRef?.instanciaEvolution ?? conversa.instancia ?? null;

  // Saudacao com o PRIMEIRO nome do cliente quando houver; senao "Olá!" (elegante).
  const nomeBruto = (
    negocio.lead.nomeManual ||
    negocio.lead.pushName ||
    negocio.lead.nome ||
    ""
  ).trim();
  const primeiroNome = nomeBruto ? nomeBruto.split(/\s+/)[0] : "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const valorFmt = formatarBRL(Number(pagamento.valor));

  // Mensagem profissional (Caminho A): link do Mercado Pago em linha propria para
  // o WhatsApp gerar o preview da marca (confianca). Padrao da casa: sem emoji.
  const texto =
    `${saudacao} Segue o link para o pagamento do seu orçamento ${pagamento.referencia} ` +
    `no valor de ${valorFmt}:\n\n` +
    `${pagamento.initPoint}\n\n` +
    `Pagamento seguro via Mercado Pago. Qualquer dúvida, estou à disposição.`;

  const resultado = await enviarTexto(numero, texto, instanciaEvolution);

  const status: StatusEnvio = resultado.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO;
  const externalId = resultado.externalId ?? `out-${randomUUID()}`;
  const agora = new Date();

  const dados = {
    conversaId: conversa.id,
    direcao: DirecaoMsg.OUT,
    tipo: TipoMsg.TEXTO,
    conteudo: texto,
    mediaUrl: null,
    instancia: instanciaEvolution,
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
      ...(conversa.agenteId ? {} : { agenteId: agente.id }),
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
    leadId: negocio.leadId,
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
      { ok: false, erro: "Falha ao enviar o link pelo WhatsApp.", mensagem: payloadMsg },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, mensagem: payloadMsg });
}

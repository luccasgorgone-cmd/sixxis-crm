// Envia o ORCAMENTO em PDF ao cliente pelo WhatsApp (Fatia 3.13). Acao REAL do
// usuario (botao com confirmacao no painel). Gera o PDF do staging atual, sobe no
// R2 e envia como DOCUMENTO reusando enviarMidia(document); registra a Mensagem
// OUT na conversa (mesmo padrao do /api/mensagens/enviar-arquivo) para aparecer na
// thread. So dispara para o numero do cliente que JA tem conversa desta finalidade
// (nunca em massa). Escopo dono/admin.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { enviarMidia } from "@/lib/evolution";
import { enviarParaR2ComRetry } from "@/lib/r2";
import { checarAcessoNegocio, montarDadosPdfOrcamento } from "@/lib/orcamentoDados";
import { gerarPdfOrcamento } from "@/lib/orcamentoPdf";
import { codigoAgente } from "@/lib/format";
import {
  DirecaoMsg,
  TipoMsg,
  StatusEnvio,
  Prisma,
} from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGENDA = "Segue seu orçamento, qualquer dúvida estou à disposição.";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;

  const acesso = await checarAcessoNegocio(agente, id);
  if (!acesso.ok) {
    return NextResponse.json({ erro: acesso.erro }, { status: acesso.status });
  }

  const montagem = await montarDadosPdfOrcamento(id);
  if (!montagem) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!montagem.temItens) {
    return NextResponse.json({ erro: "Orçamento sem itens." }, { status: 422 });
  }

  // Conversa ATIVA da finalidade do negocio (mesma que o Inbox/Kanban embutem):
  // garante que so enviamos ao cliente ja em conversa. Sem conversa -> bloqueia.
  const conversa = await prisma.conversa.findFirst({
    where: { leadId: montagem.leadId, finalidade: montagem.finalidade, arquivada: false },
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
  const numero = montagem.telefone.replace(/\D/g, "");
  if (!numero) {
    return NextResponse.json({ erro: "Cliente sem telefone válido." }, { status: 422 });
  }

  // Gera o PDF (logo da marca, se PNG/JPEG/WEBP) e sobe no R2 com chave VERSIONADA
  // por geracao (epoch): cada envio vira um objeto novo -> o WhatsApp/navegador
  // sempre baixa a versao atual, nunca um PDF antigo em cache (Fatia 3.16).
  // Codigo anonimo do atendente (Fatia J): distingue os arquivos por atendente
  // sem expor nome. Entra na chave R2, no nome do arquivo e no rodape do PDF.
  const cod = codigoAgente(agente.id);
  const bytes = await gerarPdfOrcamento(montagem.dados, montagem.logo, cod);
  const buffer = Buffer.from(bytes);
  const chave = `orcamentos/orc-${id}-${cod}-${Date.now()}.pdf`;
  const mediaUrl = await enviarParaR2ComRetry(chave, buffer, "application/pdf");
  const midiaParaEnviar = mediaUrl ?? buffer.toString("base64");

  const nomeArquivo = `Orcamento-${montagem.numeroFormatado}-${cod}.pdf`;
  const instanciaEvolution =
    conversa.instanciaRef?.instanciaEvolution ?? conversa.instancia ?? null;

  const resultado = await enviarMidia(numero, midiaParaEnviar, "document", instanciaEvolution, {
    fileName: nomeArquivo,
    caption: LEGENDA,
    mimetype: "application/pdf",
  });

  const status: StatusEnvio = resultado.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO;
  const externalId = resultado.externalId ?? `out-${randomUUID()}`;
  const agora = new Date();

  const dados = {
    conversaId: conversa.id,
    direcao: DirecaoMsg.OUT,
    tipo: TipoMsg.DOCUMENTO,
    conteudo: nomeArquivo,
    mediaUrl,
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
    leadId: montagem.leadId,
    leadNome: montagem.nomeCliente,
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
      { ok: false, erro: "Falha ao enviar o orçamento pelo WhatsApp.", mensagem: payloadMsg },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    numeroFormatado: montagem.numeroFormatado,
    mensagem: payloadMsg,
  });
}

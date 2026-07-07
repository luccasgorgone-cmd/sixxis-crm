// Move o ATENDIMENTO de um lead entre finalidades (Venda <-> Pos-venda) —
// corrige o canal quando o cliente entrou pelo funil errado. Fatia 2.84.
//
// PRINCIPIOS (respeitar a arquitetura):
//  - Conversa e UNIFICADA por (leadId, finalidade) com indice unico PARCIAL
//    (WHERE arquivada=false). Nunca violamos esse indice.
//  - NAO cria chat novo pro cliente: a conversa PRESERVA a instancia (o numero
//    SIXXIS que o cliente ja usa). Muda a organizacao interna (funil/dono), nao
//    o numero.
//  - Idempotente e sem DROP: nada e apagado; o negocio de ORIGEM e preservado.
//  - Nao dispara conversao Meta (nao fecha negocio; so garante um ABERTO no
//    destino e ajusta dono).
//
// AUTORIZACAO (Fatia 3.18): pode executar quem tem ACESSO a finalidade DESTINO
// OU a de ORIGEM (admin sempre). Motivo: o atendente que RECEBE um cliente no
// setor errado normalmente so tem acesso ao PROPRIO setor (origem) — precisa
// poder redireciona-lo. Como so ha duas finalidades, isto equivale a "qualquer
// usuario com acesso a pelo menos um setor", mantendo o guardrail (nao libera a
// quem nao atende nenhum dos dois).
//
// CONVERSA — casos:
//  1) Nao existe conversa ativa no DESTINO: MOVE a conversa de origem (update
//     finalidade), preservando instancia/instanciaId. O historico inteiro vai
//     junto. Sem colisao (destino nao tinha conversa ativa).
//  2) JA existe conversa ativa no DESTINO (colisao do indice unico): MESCLA —
//     move as mensagens da origem para a de destino, adota o NUMERO da origem na
//     de destino (para responder pelo mesmo numero do cliente) e ARQUIVA a de
//     origem (arquivada=true, sem apagar). Preserva historico e nao duplica.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import { campoDono, temAcesso, espelharDonoNasConversas } from "@/lib/dono";
import { garantirNegocioParaLead } from "@/lib/negocio";
import { rotearLeadNovo } from "@/lib/roteamento";
import {
  Finalidade,
  AtividadeTipo,
  TipoHistorico,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const oposta = (f: Finalidade): Finalidade =>
  f === Finalidade.VENDA ? Finalidade.POS_VENDA : Finalidade.VENDA;
const rotulo = (f: Finalidade): string =>
  f === Finalidade.VENDA ? "Vendas" : "Pos-venda";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { finalidadeDestino?: string; agenteDestinoId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const destino =
    body.finalidadeDestino === Finalidade.VENDA
      ? Finalidade.VENDA
      : body.finalidadeDestino === Finalidade.POS_VENDA
        ? Finalidade.POS_VENDA
        : null;
  if (!destino) {
    return NextResponse.json(
      { erro: "finalidadeDestino invalida" },
      { status: 400 },
    );
  }
  const origem = oposta(destino);

  // AUTORIZACAO: executor precisa ter acesso a finalidade DESTINO ou a de ORIGEM
  // (ou admin). Ver nota no topo: corrige o mis-channel do atendente que so tem
  // acesso ao setor de origem.
  if (
    !ehAdmin(agente.papel) &&
    !temAcesso(agente, destino) &&
    !temAcesso(agente, origem)
  ) {
    return NextResponse.json(
      { erro: "voce nao tem acesso a nenhuma das finalidades" },
      { status: 403 },
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, donoId: true, donoPosVendaId: true },
  });
  if (!lead) {
    return NextResponse.json({ erro: "cliente nao encontrado" }, { status: 404 });
  }

  // Conversas ativas (arquivada=false) de cada finalidade.
  const [convOrigem, convDestino] = await Promise.all([
    prisma.conversa.findFirst({
      where: { leadId: id, finalidade: origem, arquivada: false },
      select: {
        id: true,
        instancia: true,
        instanciaId: true,
        ultimaMensagemEm: true,
        naoLidas: true,
      },
    }),
    prisma.conversa.findFirst({
      where: { leadId: id, finalidade: destino, arquivada: false },
      select: { id: true, ultimaMensagemEm: true, naoLidas: true },
    }),
  ]);

  // NO-OP: nao ha atendimento na origem e ja existe no destino => ja esta la.
  if (!convOrigem && convDestino) {
    return NextResponse.json({ ok: true, jaNaFinalidade: true });
  }

  // Dono explicito (opcional): valida existencia, atividade e acesso ao destino.
  let donoExplicito: string | null = null;
  const agenteDestinoId =
    typeof body.agenteDestinoId === "string" && body.agenteDestinoId
      ? body.agenteDestinoId
      : null;
  if (agenteDestinoId) {
    const alvo = await prisma.agente.findUnique({
      where: { id: agenteDestinoId },
      select: { id: true, ativo: true, acessoVenda: true, acessoPosVenda: true },
    });
    if (!alvo || !alvo.ativo) {
      return NextResponse.json({ erro: "agente destino invalido" }, { status: 400 });
    }
    if (!temAcesso(alvo, destino)) {
      return NextResponse.json(
        { erro: "agente destino sem acesso a essa finalidade" },
        { status: 403 },
      );
    }
    donoExplicito = alvo.id;
  }

  // Garante o negocio ABERTO no DESTINO (idempotente: reusa se ja houver; NUNCA
  // duplica). Nao fecha negocio => nao dispara conversao Meta. Fora da transacao
  // (usa prisma proprio, como o roteamento).
  const negocioDestinoId = await garantirNegocioParaLead(id, destino);

  await prisma.$transaction(async (tx) => {
    // --- CONVERSA (preservando o numero) ---
    if (convOrigem && convDestino) {
      // MESCLA: move mensagens origem -> destino; adota o numero da origem no
      // destino (responder pelo mesmo numero do cliente); arquiva a origem.
      await tx.mensagem.updateMany({
        where: { conversaId: convOrigem.id },
        data: { conversaId: convDestino.id },
      });
      const maisRecente =
        (convOrigem.ultimaMensagemEm?.getTime() ?? 0) >
        (convDestino.ultimaMensagemEm?.getTime() ?? 0)
          ? convOrigem.ultimaMensagemEm
          : convDestino.ultimaMensagemEm;
      await tx.conversa.update({
        where: { id: convDestino.id },
        data: {
          instancia: convOrigem.instancia,
          instanciaId: convOrigem.instanciaId,
          ultimaMensagemEm: maisRecente,
          naoLidas: convDestino.naoLidas + convOrigem.naoLidas,
          arquivada: false,
          status: "aberta",
        },
      });
      // Arquiva a de origem (sem apagar — historico preservado).
      await tx.conversa.update({
        where: { id: convOrigem.id },
        data: { arquivada: true },
      });
    } else if (convOrigem) {
      // MOVE: muda so a finalidade, preservando instancia/instanciaId (numero).
      await tx.conversa.update({
        where: { id: convOrigem.id },
        data: { finalidade: destino },
      });
    }

    // --- DONO EXPLICITO (quando informado) ---
    if (donoExplicito) {
      await tx.lead.update({
        where: { id },
        data:
          destino === Finalidade.VENDA
            ? { donoId: donoExplicito }
            : { donoPosVendaId: donoExplicito },
      });
      if (negocioDestinoId) {
        await tx.negocio.update({
          where: { id: negocioDestinoId },
          data: { agenteId: donoExplicito },
        });
      }
      await espelharDonoNasConversas(tx, id, destino, donoExplicito);
    }

    // --- HISTORICO / ATIVIDADE (rastreabilidade) ---
    const descricao = `Atendimento movido de ${rotulo(origem)} para ${rotulo(destino)}`;
    if (negocioDestinoId) {
      await tx.historicoNegocio.create({
        data: {
          negocioId: negocioDestinoId,
          agenteId: agente.id,
          tipo: TipoHistorico.NOTA,
          descricao,
        },
      });
    }
    await tx.atividade.create({
      data: {
        leadId: id,
        negocioId: negocioDestinoId,
        agenteId: agente.id,
        tipo: AtividadeTipo.TRANSFERENCIA,
        descricao,
      },
    });
  });

  // AUTO: sem dono explicito -> roteia no destino (sticky/round-robin). Idempotente:
  // so atribui se o negocio do destino ainda nao tem dono. Tambem espelha nas
  // conversas. Fora da transacao (usa prisma proprio).
  if (!donoExplicito) {
    await rotearLeadNovo(id, destino);
  }

  // Tempo real: atualiza os dois funis/inboxes. O negocio de ORIGEM permanece
  // como estava (nao apagado); o admin pode encerra-lo manualmente se quiser.
  getIO()?.emit("conversa:atualizada", { leadId: id, finalidade: origem });
  getIO()?.emit("conversa:atualizada", { leadId: id, finalidade: destino });
  if (negocioDestinoId) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: negocioDestinoId,
      etapaId: null,
      motivo: "mover-finalidade",
    });
  }

  return NextResponse.json({ ok: true, finalidade: destino, negocioId: negocioDestinoId });
}

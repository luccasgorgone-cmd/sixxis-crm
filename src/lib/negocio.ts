// Helpers de dominio do Negocio compartilhados por worker, backfill e APIs.
import { prisma } from "./prisma";
import { Prisma } from "../generated/prisma/client";
import { getIO } from "./socket";
import { campoDono } from "./dono";
import { desarquivarConversaDoLead } from "./arquivamento";
import {
  StatusNeg,
  TipoEtapa,
  Temperatura,
  TipoHistorico,
  Finalidade,
  FinalidadeEtapa,
} from "../generated/prisma/enums";

// Etapas elegiveis para uma finalidade: a propria + AMBAS.
function etapasDaFinalidade(finalidade: Finalidade): FinalidadeEtapa[] {
  return finalidade === Finalidade.VENDA
    ? [FinalidadeEtapa.VENDA, FinalidadeEtapa.AMBAS]
    : [FinalidadeEtapa.POS_VENDA, FinalidadeEtapa.AMBAS];
}

// Primeira etapa ABERTA do funil da finalidade (menor ordem).
export async function primeiraEtapaAberta(finalidade: Finalidade) {
  return prisma.etapa.findFirst({
    where: {
      tipo: TipoEtapa.ABERTA,
      ativo: true,
      finalidade: { in: etapasDaFinalidade(finalidade) },
    },
    orderBy: { ordem: "asc" },
  });
}

// Bloco 4 — marca a INTERACAO (mensagem IN ou OUT) no negocio da finalidade.
// Espelha Conversa.ultimaMensagemEm no nivel do Negocio, que e o que o Kanban
// consegue ORDENAR: nas colunas terminais (Vendido/Perdido) quem falou por
// ultimo sobe ao topo. Tambem reseta o relogio do arquivamento por prazo.
//
// updateMany sem filtro de status: vale para negocio aberto, ganho e perdido —
// e justamente o fechado que precisa disto. Best-effort: NUNCA quebra a
// ingestao/envio de mensagem (o registro da mensagem ja aconteceu antes).
export async function marcarInteracaoNoNegocio(
  leadId: string,
  finalidade: Finalidade,
  hora: Date,
): Promise<void> {
  try {
    await prisma.negocio.updateMany({
      where: { leadId, finalidade },
      data: { ultimaMensagemEm: hora },
    });
  } catch (erro) {
    console.warn(
      `[negocio] falha ao marcar interacao do lead ${leadId}: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }
}

// Garante UM negocio aberto para o lead NAQUELA finalidade. Idempotente.
// Retorna o id do negocio aberto (existente, reaberto ou criado) ou null se sem
// funil. INVARIANTE (Bloco 1): um lead + finalidade tem no MAXIMO um negocio —
// se ja existe qualquer negocio (aberto, ganho ou perdido), ele e REUSADO; esta
// funcao so cria um negocio para quem ainda nao tem nenhum.
export async function garantirNegocioParaLead(
  leadId: string,
  finalidade: Finalidade = Finalidade.VENDA,
  emitir = true,
): Promise<string | null> {
  const existente = await prisma.negocio.findFirst({
    where: { leadId, finalidade, status: StatusNeg.ABERTO },
    select: { id: true },
  });
  if (existente) return existente.id;

  const etapa = await primeiraEtapaAberta(finalidade);
  if (!etapa) return null; // funil ainda nao configurado

  // Dono da finalidade -> agenteId do negocio (mesma regra do roteamento). Sem
  // isto, negocios criados por "Conversar"/cadastro manual nasciam ORFAOS
  // (agenteId null) e SUMIAM do Kanban do proprio colaborador, que filtra por
  // agenteId = ele. Fatia 3.07 (bug do card que nao aparecia sem F5). null quando
  // nao ha dono ainda (ex.: backfill) — segue o comportamento anterior.
  const leadDono = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { donoId: true, donoPosVendaId: true },
  });
  const agenteId = leadDono ? leadDono[campoDono(finalidade)] : null;

  // CLIENTE QUE VOLTA (Bloco 1): sem negocio ABERTO, mas ha um negocio FECHADO na
  // finalidade — PERDIDO **ou GANHO** -> REABRE esse mesmo negocio. Nunca cria um
  // segundo card: um lead + finalidade = no maximo UM negocio, sempre reusado.
  //
  // O caso GANHO era o buraco que gerava a DUPLICATA: o cliente vendido mandava
  // mensagem, nao havia negocio ABERTO nem PERDIDO, e um negocio novo nascia na
  // 1a etapa — ficando um card em "Vendido" E outro em "Novo" para o mesmo lead.
  //
  // Preserva TODO o historico: HistoricoNegocio (a PERDA e o GANHO), rastreios,
  // itens do pedido, orcamentos e valores continuam ligados a este negocio. O que
  // e limpo (motivo da perda) fica gravado na MEMORIA DE FECHAMENTO abaixo.
  const anterior = await prisma.negocio.findFirst({
    where: {
      leadId,
      finalidade,
      status: { in: [StatusNeg.PERDIDO, StatusNeg.GANHO] },
    },
    orderBy: [{ fechadoEm: { sort: "desc", nulls: "last" } }, { atualizadoEm: "desc" }],
    select: {
      id: true,
      status: true,
      motivoPerda: true,
      motivoPerdaObs: true,
      fechadoEm: true,
    },
  });
  if (anterior) {
    const agora = new Date();
    const eraPerdido = anterior.status === StatusNeg.PERDIDO;
    const reaberto = await prisma.negocio.update({
      where: { id: anterior.id },
      data: {
        status: StatusNeg.ABERTO,
        etapaId: etapa.id,
        entrouEtapaEm: agora,
        fechadoEm: null,
        // Bloco 3: voltar a falar traz o card de volta ao quadro. Um negocio
        // arquivado pelo prazo que reabre NAO pode continuar invisivel.
        // A CONVERSA e desarquivada logo apos o update (o Inbox e o outro
        // campo, Conversa.arquivada — os dois voltam juntos).
        arquivado: false,
        arquivadoEm: null,
        // Limpa o motivo (agora esta aberto); a PERDA anterior permanece no
        // HistoricoNegocio, entao o registro da perda NAO some.
        motivoPerda: null,
        motivoPerdaObs: null,
        // MEMORIA DE FECHAMENTO (Bloco 5): grava o que sera limpo ANTES de limpar.
        // So marca; nunca desmarca (o selo do painel e memoria, nao estado atual).
        ...(eraPerdido
          ? {
              jaFoiPerdido: true,
              ...(anterior.motivoPerda
                ? {
                    ultimoMotivoPerda: anterior.motivoPerda,
                    ultimoMotivoPerdaObs: anterior.motivoPerdaObs,
                  }
                : {}),
              ultimaPerdaEm: anterior.fechadoEm ?? agora,
            }
          : { jaFoiGanho: true, ultimoGanhoEm: anterior.fechadoEm ?? agora }),
        // Reatribui ao dono da finalidade quando houver (nao apaga um agenteId ja
        // definido se o lead estiver sem dono no momento).
        ...(agenteId ? { agenteId } : {}),
        historicos: {
          create: {
            tipo: TipoHistorico.NOTA,
            descricao: eraPerdido
              ? `Cliente retornou apos perda${
                  anterior.motivoPerda ? " (perda anterior preservada no historico)" : ""
                }`
              : "Cliente retornou apos a venda (ganho anterior preservado no historico)",
          },
        },
      },
      select: { id: true, etapaId: true },
    });
    // CLIENTE QUE VOLTA, PARTE 2: o card voltou ao Kanban; a conversa tem que
    // voltar ao Inbox. Na ingestao a conversa ja foi reaberta antes daqui
    // (garantirConversaUnificada) e isto vira no-op; nos outros caminhos que
    // reabrem o negocio (ex.: "Conversar"/cadastro manual) e o que evita o
    // card reaparecer no quadro e a conversa seguir sumida do Inbox.
    await desarquivarConversaDoLead(leadId, finalidade);
    if (emitir) {
      getIO()?.emit("negocio:atualizado", {
        negocioId: reaberto.id,
        etapaId: reaberto.etapaId,
        motivo: "reaberto",
      });
    }
    return reaberto.id;
  }

  let negocio: { id: string; etapaId: string | null };
  try {
    negocio = await prisma.negocio.create({
      data: {
        leadId,
        etapaId: etapa.id,
        agenteId,
        status: StatusNeg.ABERTO,
        temperatura: Temperatura.MORNO,
        finalidade,
        entrouEtapaEm: new Date(),
        historicos: {
          create: {
            tipo: TipoHistorico.CRIACAO,
            descricao: "Negocio criado a partir da conversa",
          },
        },
      },
      select: { id: true, etapaId: true },
    });
  } catch (erro) {
    // CORRIDA: duas mensagens do mesmo lead+finalidade chegando juntas podem
    // passar as duas pelas buscas acima e tentar criar o negocio ao mesmo tempo.
    // Hoje isso gera um duplicado silencioso; com o indice unico parcial
    // aplicado (prisma/manual/20260812020000_negocio_unico_ativo.sql) o segundo
    // bate em P2002. Aqui ele REUSA o que o primeiro criou em vez de estourar —
    // mesmo padrao de garantirConversaUnificada. Sem o indice no banco este
    // catch nunca dispara.
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      const criadoNaCorrida = await prisma.negocio.findFirst({
        where: { leadId, finalidade, arquivado: false },
        select: { id: true },
      });
      if (criadoNaCorrida) return criadoNaCorrida.id;
    }
    throw erro;
  }

  if (emitir) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: negocio.id,
      etapaId: negocio.etapaId,
      motivo: "criado",
    });
  }
  return negocio.id;
}

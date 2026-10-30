// "A Prazo" + coluna VIP: operacoes de banco. O card parado em A Prazo nao cobra
// SLA (etapa sem ConfigAlertaSla) nem metricas (excluido em metricas.ts), tem
// borda azul e um Lembrete na agenda do dono no dia do prazo (aviso 24h antes).
// Ao sair (auto-retorno, dono mover, ou cliente responder) limpa prazo+etiqueta+
// lembrete. VIP: marcar a etiqueta VIP move o card para a coluna VIP.
import { prisma } from "../prisma";
import {
  Finalidade,
  FinalidadeEtapa,
  StatusNeg,
  TipoEtapa,
  TipoHistorico,
  StatusLembrete,
} from "../../generated/prisma/enums";
import { resolverAlertasNegocio } from "../slaAlertas";
import { criarNotificacao } from "../notificacao";
import { prazoAteDe, normalizarDias, AVISO_ANTES_MIN } from "./calc";

export const NOME_ETAPA_A_PRAZO = "A Prazo";
export const NOME_ETAPA_VIP = "VIP";
export const NOME_ETAPA_EM_ATENDIMENTO = "Em atendimento";
export const NOME_ETIQUETA_A_PRAZO = "A Prazo";
export const NOME_ETIQUETA_VIP = "VIP";
const PREFIXO_LEMBRETE = "A Prazo:";

function nomeCliente(l: {
  nome?: string | null;
  nomeManual?: string | null;
  pushName?: string | null;
  telefone: string;
}): string {
  return l.nomeManual || l.pushName || l.nome || l.telefone;
}

async function etapaVendaPorNome(nome: string): Promise<{ id: string } | null> {
  return prisma.etapa.findFirst({
    where: {
      nome,
      finalidade: FinalidadeEtapa.VENDA,
      ativo: true,
      tipo: TipoEtapa.ABERTA,
    },
    select: { id: true },
  });
}

async function etiquetaPorNome(nome: string): Promise<{ id: string } | null> {
  return prisma.etiqueta.findFirst({ where: { nome }, select: { id: true } });
}

// Marca um negocio VENDA ABERTO como "A Prazo": move para a coluna A Prazo, grava
// o prazo (agora + dias corridos), aplica a etiqueta azul, resolve alertas de SLA
// e cria o Lembrete na agenda do dono (aviso 24h antes + no dia). Retorna o prazo
// ou um erro de dominio.
export async function marcarAPrazo(
  negocioId: string,
  agenteId: string,
  dias: number,
): Promise<{ prazoContatoAte: Date } | { erro: string }> {
  const negocio = await prisma.negocio.findUnique({
    where: { id: negocioId },
    select: {
      id: true,
      leadId: true,
      finalidade: true,
      status: true,
      agenteId: true,
      lead: {
        select: { nome: true, nomeManual: true, pushName: true, telefone: true },
      },
    },
  });
  if (!negocio) return { erro: "negocio nao encontrado" };
  if (negocio.finalidade !== Finalidade.VENDA)
    return { erro: "A Prazo e somente no funil de Venda" };
  if (negocio.status !== StatusNeg.ABERTO)
    return { erro: "negocio nao esta aberto" };

  const etapa = await etapaVendaPorNome(NOME_ETAPA_A_PRAZO);
  if (!etapa) return { erro: "etapa A Prazo nao encontrada" };
  const etiqueta = await etiquetaPorNome(NOME_ETIQUETA_A_PRAZO);

  const agora = new Date();
  const d = normalizarDias(dias);
  const prazoContatoAte = prazoAteDe(agora, d);
  const donoId = negocio.agenteId ?? agenteId;
  const cliente = nomeCliente(negocio.lead);
  const dataFmt = prazoContatoAte.toLocaleDateString("pt-BR");

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: { etapaId: etapa.id, entrouEtapaEm: agora, prazoContatoAte },
    });
    if (etiqueta) {
      await tx.leadEtiqueta.upsert({
        where: {
          leadId_etiquetaId: { leadId: negocio.leadId, etiquetaId: etiqueta.id },
        },
        create: { leadId: negocio.leadId, etiquetaId: etiqueta.id },
        update: {},
      });
    }
    await tx.historicoNegocio.create({
      data: {
        negocioId,
        agenteId,
        tipo: TipoHistorico.ETAPA,
        descricao: `Colocado A Prazo — recontatar em ${d} dia(s) (${dataFmt})`,
      },
    });
    // Agenda do dono: Lembrete no dia do prazo, com aviso 24h antes.
    await tx.lembrete.create({
      data: {
        leadId: negocio.leadId,
        negocioId,
        agenteId: donoId,
        finalidade: Finalidade.VENDA,
        dataHora: prazoContatoAte,
        lembrarAntesMin: AVISO_ANTES_MIN,
        nota: `${PREFIXO_LEMBRETE} recontatar ${cliente} (prazo ${dataFmt})`,
      },
    });
  });
  await resolverAlertasNegocio(negocioId);
  return { prazoContatoAte };
}

// Limpa a marcacao A Prazo (sem mover etapa): prazo = null, tira a etiqueta azul
// e cancela o Lembrete pendente do recontato. Idempotente.
export async function limparMarcacaoAPrazo(
  negocioId: string,
  leadId: string,
): Promise<void> {
  const etiqueta = await etiquetaPorNome(NOME_ETIQUETA_A_PRAZO);
  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: { prazoContatoAte: null },
    });
    if (etiqueta) {
      await tx.leadEtiqueta.deleteMany({
        where: { leadId, etiquetaId: etiqueta.id },
      });
    }
    await tx.lembrete.updateMany({
      where: {
        negocioId,
        status: StatusLembrete.PENDENTE,
        nota: { startsWith: PREFIXO_LEMBRETE },
      },
      data: { status: StatusLembrete.CANCELADO, concluidoEm: new Date() },
    });
  });
}

// Auto-retorno (job, a cada 15 min): negocios em A Prazo cujo prazo venceu voltam
// para Em atendimento, limpam a marcacao e notificam o dono. Recomeca o ciclo.
export async function processarAPrazo(): Promise<void> {
  try {
    const [etapaAPrazo, emAtendimento] = await Promise.all([
      etapaVendaPorNome(NOME_ETAPA_A_PRAZO),
      etapaVendaPorNome(NOME_ETAPA_EM_ATENDIMENTO),
    ]);
    if (!etapaAPrazo || !emAtendimento) return;
    const agora = new Date();
    const vencidos = await prisma.negocio.findMany({
      where: {
        status: StatusNeg.ABERTO,
        etapaId: etapaAPrazo.id,
        prazoContatoAte: { not: null, lte: agora },
      },
      select: {
        id: true,
        leadId: true,
        agenteId: true,
        lead: {
          select: { nome: true, nomeManual: true, pushName: true, telefone: true },
        },
      },
    });
    for (const n of vencidos) {
      await prisma.$transaction(async (tx) => {
        await tx.negocio.update({
          where: { id: n.id },
          data: { etapaId: emAtendimento.id, entrouEtapaEm: agora },
        });
        await tx.historicoNegocio.create({
          data: {
            negocioId: n.id,
            tipo: TipoHistorico.ETAPA,
            descricao:
              "A Prazo vencido — retornou automaticamente para Em atendimento",
          },
        });
      });
      await limparMarcacaoAPrazo(n.id, n.leadId);
      if (n.agenteId) {
        await criarNotificacao({
          agenteId: n.agenteId,
          tipo: "A_PRAZO",
          titulo: "Prazo do cliente venceu",
          descricao: `${nomeCliente(n.lead)} voltou para Em atendimento — retome o contato`,
          link: "/kanban",
          leadId: null,
        });
      }
      await resolverAlertasNegocio(n.id);
    }
  } catch (erro) {
    console.error(
      `[aprazo] falha no auto-retorno: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Cliente respondeu antes do prazo: tira o card de A Prazo e volta para Em
// atendimento (NAO depende do followupAtivo — e feature propria). Chamado na
// ingestao de mensagem de ENTRADA.
export async function retornarAPrazoPorInbound(
  leadId: string,
  finalidade: Finalidade,
): Promise<void> {
  try {
    if (finalidade !== Finalidade.VENDA) return;
    const [etapaAPrazo, emAtendimento] = await Promise.all([
      etapaVendaPorNome(NOME_ETAPA_A_PRAZO),
      etapaVendaPorNome(NOME_ETAPA_EM_ATENDIMENTO),
    ]);
    if (!etapaAPrazo || !emAtendimento) return;
    const negocio = await prisma.negocio.findFirst({
      where: {
        leadId,
        finalidade: Finalidade.VENDA,
        status: StatusNeg.ABERTO,
        etapaId: etapaAPrazo.id,
      },
      select: { id: true },
    });
    if (!negocio) return;
    const agora = new Date();
    await prisma.negocio.update({
      where: { id: negocio.id },
      data: { etapaId: emAtendimento.id, entrouEtapaEm: agora },
    });
    await prisma.historicoNegocio.create({
      data: {
        negocioId: negocio.id,
        tipo: TipoHistorico.ETAPA,
        descricao: "Cliente respondeu — saiu de A Prazo para Em atendimento",
      },
    });
    await limparMarcacaoAPrazo(negocio.id, leadId);
    await resolverAlertasNegocio(negocio.id);
  } catch (erro) {
    console.error(
      `[aprazo] falha no retorno por inbound: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// VIP: ao marcar a etiqueta VIP, move o negocio VENDA ABERTO para a coluna VIP
// (agrupa todos os VIP; eles ja ficam fora do SLA e das metricas). Idempotente.
export async function moverParaVipSeVenda(negocioId: string): Promise<void> {
  try {
    const negocio = await prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { finalidade: true, status: true, etapaId: true },
    });
    if (
      !negocio ||
      negocio.finalidade !== Finalidade.VENDA ||
      negocio.status !== StatusNeg.ABERTO
    )
      return;
    const vip = await etapaVendaPorNome(NOME_ETAPA_VIP);
    if (!vip || negocio.etapaId === vip.id) return;
    const agora = new Date();
    await prisma.negocio.update({
      where: { id: negocioId },
      data: { etapaId: vip.id, entrouEtapaEm: agora },
    });
    await prisma.historicoNegocio.create({
      data: {
        negocioId,
        tipo: TipoHistorico.ETAPA,
        descricao: "Cliente VIP — movido para a coluna VIP",
      },
    });
    await resolverAlertasNegocio(negocioId);
  } catch (erro) {
    console.error(
      `[vip] falha ao mover para VIP: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Ao REMOVER a etiqueta VIP: se o card esta na coluna VIP, volta para Em
// atendimento (senao ficaria um card sem VIP numa coluna de VIP).
export async function sairDaVipSeNaColuna(negocioId: string): Promise<void> {
  try {
    const [vip, emAtendimento] = await Promise.all([
      etapaVendaPorNome(NOME_ETAPA_VIP),
      etapaVendaPorNome(NOME_ETAPA_EM_ATENDIMENTO),
    ]);
    if (!vip || !emAtendimento) return;
    const negocio = await prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { etapaId: true, status: true },
    });
    if (!negocio || negocio.etapaId !== vip.id || negocio.status !== StatusNeg.ABERTO)
      return;
    const agora = new Date();
    await prisma.negocio.update({
      where: { id: negocioId },
      data: { etapaId: emAtendimento.id, entrouEtapaEm: agora },
    });
    await prisma.historicoNegocio.create({
      data: {
        negocioId,
        tipo: TipoHistorico.ETAPA,
        descricao: "Etiqueta VIP removida — voltou para Em atendimento",
      },
    });
  } catch (erro) {
    console.error(
      `[vip] falha ao sair da VIP: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

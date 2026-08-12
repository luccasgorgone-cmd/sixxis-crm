// Bloco 3 — job diario que ESVAZIA o Kanban por PRAZO. Espelha o padrao de
// lib/aniversarios.ts: roda no boot e a cada 24h, e nunca derruba o servidor.
//
// O QUE FAZ: tira do quadro os negocios PERDIDO (apos `diasArquivarPerdido`) e
// GANHO (apos `diasArquivarGanho`). "Sair do quadro" = arquivado=true. NADA e
// deletado: lead, conversa, historico, valores e o proprio negocio continuam no
// banco e nas telas de cliente.
//
// CADA LADO TEM SEU RELOGIO — e a regra do dono:
//   GANHO   -> ultima INTERACAO (ultimaMensagemEm). RENOVA: so sai depois de X
//              dias sem nenhuma mensagem; o cliente falou, o prazo reinicia.
//   PERDIDO -> ENTRADA na coluna (entrouEtapaEm). NAO RENOVA: conta fixo a
//              partir do momento em que o negocio foi dado como perdido. Passados
//              X dias ele sai, mesmo que o cliente tenha mandado mensagem ontem.
//              (Se o cliente volta a falar o negocio REABRE — vira ABERTO e some
//              deste job; o prazo do perdido so corre enquanto ele for perdido.)
//
// KANBAN E INBOX ANDAM JUNTOS: arquivar sao DOIS campos separados —
// Negocio.arquivado (tira do Kanban) e Conversa.arquivada (tira do Inbox),
// ligados por leadId + finalidade. Antes o job so mexia no Negocio: o card
// sumia do quadro e a conversa continuava no Inbox. Agora todo arquivamento
// escreve os dois no MESMO passo (transacao por lote) e o desarquivamento
// (cliente que volta a falar) reabre os dois.
//
// TRES TRAVAS DE SEGURANCA:
//   1) prazo null/0 => aquele lado nao arquiva (o recurso nasce desligado);
//   2) arquivamentoAtivo=false (padrao) => MODO LOG: conta quantos arquivaria e
//      NAO escreve nada. O dono liga no admin quando confiar no numero;
//   3) o filtro de status e explicito (PERDIDO / GANHO): o JOB nunca arquiva um
//      negocio ABERTO, qualquer que seja a configuracao. (Desde a Fatia 10 ha um
//      caminho que arquiva ABERTO: o "Encerrar" do card, pedido a mao pelo
//      vendedor em /api/negocios/[id]/encerrar. Nenhum automatismo faz isso.)
import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";
import { Finalidade, StatusNeg } from "../generated/prisma/enums";

// RELOGIO DO GANHO: ultima interacao (mensagem IN ou OUT espelhada no negocio
// pelo Bloco 4). Negocio que nunca teve mensagem cai no atualizadoEm — mesma
// semantica de COALESCE(ultimaMensagemEm, atualizadoEm) < corte. RENOVA: cada
// mensagem nova empurra o prazo para frente.
function paradoDesde(corte: Date): Prisma.NegocioWhereInput {
  return {
    OR: [
      { ultimaMensagemEm: { lt: corte } },
      { ultimaMensagemEm: null, atualizadoEm: { lt: corte } },
    ],
  };
}

// RELOGIO DO PERDIDO: quando entrou na coluna. Marcar como perdido e um
// movimento de etapa, e todo movimento grava entrouEtapaEm=agora (ver o PATCH
// de /api/negocios/[id]) — entao para um negocio perdido este campo E a data em
// que ele virou perdido. NAO RENOVA de proposito: mensagem do cliente nao
// empurra o prazo. Se o cliente volta a falar o negocio e REABERTO (status
// ABERTO) e sai do alcance do job, que so olha PERDIDO/GANHO.
//
// Sem COALESCE aqui porque nao ha o que coalescer: entrouEtapaEm e NOT NULL no
// banco (DateTime @default(now())), entao nao existe perdido "imortal" sem
// relogio — o proprio schema garante o que o fallback garantiria.
function naColunaDesde(corte: Date): Prisma.NegocioWhereInput {
  return { entrouEtapaEm: { lt: corte } };
}

function corteDe(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d;
}

// Prazo valido = inteiro >= 1. null, 0 e lixo contam como DESLIGADO.
function prazoValido(dias: number | null | undefined): number | null {
  if (dias == null || !Number.isFinite(dias)) return null;
  const n = Math.trunc(dias);
  return n >= 1 ? n : null;
}

// ---------------------------------------------------------------------------
// ARQUIVAMENTO CASADO (Negocio + Conversa)
// ---------------------------------------------------------------------------

export type ContagemArquivamento = {
  venda: number;
  posVenda: number;
  total: number;
  conversas: number;
};

// ORIGEM do arquivamento (Fatia 10), gravada em Negocio.arquivadoMotivo. Os dois
// caminhos terminam no mesmo arquivado=true, entao sem esta marca o dono nao
// separaria depois um do outro.
//   PRAZO  = o negocio venceu o relogio (job diario ou a limpeza pontual).
//   MANUAL = o vendedor clicou "Encerrar" no card. Nao e ganho nem perda: e um
//            atendimento que acabou sem desfecho de venda.
// null continua valendo para tudo que foi arquivado ANTES desta fatia.
//   EXCLUIDO = o vendedor EXCLUIU o card dizendo que aquilo nao foi venda. Sai
//              do quadro como o MANUAL, mas alem disso os ganhos do negocio
//              deixam de contar como compra do cliente (Fatia 15-A). Separado do
//              MANUAL porque encerrar um atendimento e dizer "acabou"; excluir e
//              dizer "nao aconteceu".
export const ARQUIVO_PRAZO = "PRAZO";
export const ARQUIVO_MANUAL = "MANUAL";
export const ARQUIVO_EXCLUIDO = "EXCLUIDO";

// Lote de ids por UPDATE. So para nao mandar um IN gigante ao Postgres quando a
// varredura pega milhares de cards de uma vez (limpeza pontual dos perdidos).
const LOTE = 500;

// Arquiva UM lado (finalidade): o Negocio e a Conversa do mesmo lead+finalidade,
// no mesmo passo. Sempre em lotes; cada lote e uma transacao, entao nunca fica
// "metade" — ou o card e a conversa saem juntos, ou nenhum dos dois.
async function arquivarLado(
  where: Prisma.NegocioWhereInput,
  finalidade: Finalidade,
  agora: Date,
  motivo: string | null,
): Promise<{ negocios: number; conversas: number }> {
  // `arquivado: false` aqui e o que torna tudo IDEMPOTENTE: quem ja saiu do
  // quadro nao e relido nem reescrito numa segunda passada.
  const alvos = await prisma.negocio.findMany({
    where: { ...where, finalidade, arquivado: false },
    select: { id: true, leadId: true },
  });
  let negocios = 0;
  let conversas = 0;
  for (let i = 0; i < alvos.length; i += LOTE) {
    const lote = alvos.slice(i, i + LOTE);
    const ids = lote.map((n) => n.id);
    const leadIds = [...new Set(lote.map((n) => n.leadId))];
    const [resNegocio, resConversa] = await prisma.$transaction([
      prisma.negocio.updateMany({
        where: { id: { in: ids }, arquivado: false },
        data: {
          arquivado: true,
          arquivadoEm: agora,
          // So escreve quando quem chamou disse a origem; sem motivo a coluna
          // fica como estava, e nenhum chamador antigo muda de comportamento.
          ...(motivo ? { arquivadoMotivo: motivo } : {}),
        },
      }),
      // A Conversa ATIVA daquele lead+setor. O indice unico parcial
      // (leadId, finalidade) WHERE arquivada=false garante no maximo uma por
      // lead; arquivar varias e permitido (historico), entao nao ha conflito.
      prisma.conversa.updateMany({
        where: { leadId: { in: leadIds }, finalidade, arquivada: false },
        data: { arquivada: true },
      }),
    ]);
    negocios += resNegocio.count;
    conversas += resConversa.count;
  }
  return { negocios, conversas };
}

// Arquiva os negocios que casam com `where` (VENDA + POS_VENDA) e, junto, as
// conversas correspondentes. Retorna a contagem separada por finalidade — e o
// numero que o job loga e que a limpeza pontual devolve para conferencia.
//
// NUNCA deleta nada: so vira dois booleanos. Quem chama e responsavel por
// filtrar o STATUS — o job e a limpeza filtram PERDIDO/GANHO explicitamente; o
// "Encerrar" do card (Fatia 10) passa um id direto, sem filtro de status, e e o
// unico caminho pelo qual um negocio ABERTO chega aqui.
//
// `motivo` grava a ORIGEM em Negocio.arquivadoMotivo (ARQUIVO_PRAZO /
// ARQUIVO_MANUAL). null nao toca a coluna.
export async function arquivarNegociosEConversas(
  where: Prisma.NegocioWhereInput,
  motivo: string | null = null,
): Promise<ContagemArquivamento> {
  const agora = new Date();
  const venda = await arquivarLado(where, Finalidade.VENDA, agora, motivo);
  const pos = await arquivarLado(where, Finalidade.POS_VENDA, agora, motivo);
  return {
    venda: venda.negocios,
    posVenda: pos.negocios,
    total: venda.negocios + pos.negocios,
    conversas: venda.conversas + pos.conversas,
  };
}

// Conta (sem escrever) o que `arquivarNegociosEConversas` arquivaria. Usado
// pelo MODO LOG do job e pela previa (GET) da limpeza pontual.
export async function contarArquivaveis(
  where: Prisma.NegocioWhereInput,
): Promise<ContagemArquivamento> {
  const [venda, posVenda] = await Promise.all([
    prisma.negocio.count({
      where: { ...where, finalidade: Finalidade.VENDA, arquivado: false },
    }),
    prisma.negocio.count({
      where: { ...where, finalidade: Finalidade.POS_VENDA, arquivado: false },
    }),
  ]);
  return { venda, posVenda, total: venda + posVenda, conversas: 0 };
}

// DESARQUIVAMENTO casado: o card voltou ao Kanban, a conversa tem que voltar ao
// Inbox. Chamado quando o cliente volta a falar (lib/negocio) e quando o negocio
// e reaberto na mao (reativar / mover para etapa aberta).
//
// CUIDADO COM O INDICE UNICO PARCIAL (leadId, finalidade) WHERE arquivada=false:
// nao da para desarquivar em massa. Um lead pode ter VARIAS conversas arquivadas
// do mesmo setor (o merge da fatia 231a arquivou as duplicadas) — desarquivar
// todas violaria o indice. Entao: se ja existe conversa ativa, nao faz nada;
// senao reabre UMA so, a mais recente. Best-effort: nunca quebra quem chamou.
export async function desarquivarConversaDoLead(
  leadId: string,
  finalidade: Finalidade,
): Promise<void> {
  try {
    const ativa = await prisma.conversa.findFirst({
      where: { leadId, finalidade, arquivada: false },
      select: { id: true },
    });
    if (ativa) return; // ja esta no Inbox
    const alvo = await prisma.conversa.findFirst({
      where: { leadId, finalidade, arquivada: true },
      orderBy: [
        { ultimaMensagemEm: { sort: "desc", nulls: "last" } },
        { criadoEm: "desc" },
      ],
      select: { id: true },
    });
    if (!alvo) return; // lead sem conversa nesse setor
    await prisma.conversa.update({
      where: { id: alvo.id },
      data: { arquivada: false },
    });
  } catch (erro) {
    console.warn(
      `[arquivar] falha ao desarquivar conversa do lead ${leadId}: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }
}

export async function arquivarNegociosVencidos(): Promise<void> {
  try {
    const config = await prisma.configuracaoCRM.findFirst({
      select: {
        diasArquivarPerdido: true,
        diasArquivarGanho: true,
        arquivamentoAtivo: true,
      },
    });
    if (!config) {
      console.log("[arquivar] sem ConfiguracaoCRM ainda; nada a fazer");
      return;
    }

    const diasPerdido = prazoValido(config.diasArquivarPerdido);
    const diasGanho = prazoValido(config.diasArquivarGanho);
    if (diasPerdido == null && diasGanho == null) {
      console.log("[arquivar] desligado (nenhum prazo configurado)");
      return;
    }

    // Um alvo por status. `arquivado: false` mantem a passada idempotente: o que
    // ja saiu do quadro nao entra na conta nem e reescrito.
    const alvos: { rotulo: string; where: Prisma.NegocioWhereInput }[] = [];
    if (diasPerdido != null) {
      alvos.push({
        rotulo: "perdidos",
        where: {
          status: StatusNeg.PERDIDO,
          arquivado: false,
          // Relogio pela ENTRADA na coluna (nao renova com interacao).
          ...naColunaDesde(corteDe(diasPerdido)),
        },
      });
    }
    if (diasGanho != null) {
      alvos.push({
        rotulo: "ganhos",
        where: {
          status: StatusNeg.GANHO,
          arquivado: false,
          ...paradoDesde(corteDe(diasGanho)),
        },
      });
    }

    // MODO LOG (padrao): so conta. Nenhuma escrita ate o dono ligar o mestre.
    if (config.arquivamentoAtivo !== true) {
      const contagens = await Promise.all(
        alvos.map((a) => contarArquivaveis(a.where)),
      );
      const detalhe = alvos
        .map((a, i) => `${contagens[i].total} ${a.rotulo}`)
        .join(", ");
      console.log(
        `[arquivar] MODO LOG: arquivaria ${detalhe} ` +
          `(prazos: perdido=${diasPerdido ?? "off"}d, ganho=${diasGanho ?? "off"}d). ` +
          "Nada foi arquivado — ligue 'arquivamentoAtivo' no admin para valer.",
      );
      return;
    }

    // Sequencial de proposito: cada lote e uma transacao curta (negocio +
    // conversa juntos) e nao vale competir por conexao num job de fundo.
    const partes: string[] = [];
    for (const a of alvos) {
      const r = await arquivarNegociosEConversas(a.where, ARQUIVO_PRAZO);
      partes.push(
        `${r.total} ${a.rotulo} (venda ${r.venda}, pos-venda ${r.posVenda}, ` +
          `${r.conversas} conversas)`,
      );
    }
    console.log(
      `[arquivar] ${partes.join(", ")} arquivados ` +
        "(dados preservados; somem do Kanban E do Inbox)",
    );
  } catch (erro) {
    console.error(
      `[arquivar] falha: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Roda agora e repete a cada 24h. Chamado no boot (server.ts).
export function iniciarArquivamento(): void {
  void arquivarNegociosVencidos();
  setInterval(
    () => {
      void arquivarNegociosVencidos();
    },
    24 * 60 * 60 * 1000,
  );
}

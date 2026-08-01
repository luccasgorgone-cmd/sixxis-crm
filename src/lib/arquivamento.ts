// Bloco 3 — job diario que ESVAZIA o Kanban por PRAZO. Espelha o padrao de
// lib/aniversarios.ts: roda no boot e a cada 24h, e nunca derruba o servidor.
//
// O QUE FAZ: negocio PERDIDO sem nova interacao ha mais de `diasArquivarPerdido`
// dias sai do quadro; idem GANHO com `diasArquivarGanho`. "Sair do quadro" =
// arquivado=true. NADA e deletado: lead, conversa, historico, valores e o
// proprio negocio continuam no banco e nas telas de cliente.
//
// TRES TRAVAS DE SEGURANCA:
//   1) prazo null/0 => aquele lado nao arquiva (o recurso nasce desligado);
//   2) arquivamentoAtivo=false (padrao) => MODO LOG: conta quantos arquivaria e
//      NAO escreve nada. O dono liga no admin quando confiar no numero;
//   3) o filtro de status e explicito (PERDIDO / GANHO): negocio ABERTO NUNCA e
//      arquivado, qualquer que seja a configuracao.
import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";
import { StatusNeg } from "../generated/prisma/enums";

// Relogio do prazo = ultima interacao (mensagem IN ou OUT espelhada no negocio
// pelo Bloco 4). Negocio que nunca teve mensagem cai no atualizadoEm — mesma
// semantica de COALESCE(ultimaMensagemEm, atualizadoEm) < corte.
function paradoDesde(corte: Date): Prisma.NegocioWhereInput {
  return {
    OR: [
      { ultimaMensagemEm: { lt: corte } },
      { ultimaMensagemEm: null, atualizadoEm: { lt: corte } },
    ],
  };
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
          ...paradoDesde(corteDe(diasPerdido)),
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
        alvos.map((a) => prisma.negocio.count({ where: a.where })),
      );
      const detalhe = alvos
        .map((a, i) => `${contagens[i]} ${a.rotulo}`)
        .join(", ");
      console.log(
        `[arquivar] MODO LOG: arquivaria ${detalhe} ` +
          `(prazos: perdido=${diasPerdido ?? "off"}d, ganho=${diasGanho ?? "off"}d). ` +
          "Nada foi arquivado — ligue 'arquivamentoAtivo' no admin para valer.",
      );
      return;
    }

    const agora = new Date();
    const resultados = await Promise.all(
      alvos.map((a) =>
        prisma.negocio.updateMany({
          where: a.where,
          data: { arquivado: true, arquivadoEm: agora },
        }),
      ),
    );
    const detalhe = alvos
      .map((a, i) => `${resultados[i].count} ${a.rotulo}`)
      .join(", ");
    console.log(
      `[arquivar] ${detalhe} arquivados (dados preservados; so somem do Kanban)`,
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

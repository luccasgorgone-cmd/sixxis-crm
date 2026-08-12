// ATENDIMENTOS ANTERIORES que NAO converteram: as perdas do cliente, com data e
// motivo de cada uma. Simetrico de lib/compras — juntos, os dois dao o historico
// completo do cliente no painel: o que ele comprou e o que nao fechou.
//
// POR QUE EXISTE: o painel ja mostrava as COMPRAS datadas (Fatia 7) e um selo
// dizendo "ja foi dado como perdido Nx" com o ULTIMO motivo. Faltava o outro
// lado datado: quando cada perda aconteceu e por que. Quem atende um cliente que
// voltou precisa saber que ele desistiu duas vezes por preco em marco, nao so
// que "ja foi perdido".
//
// FONTE: os eventos HistoricoNegocio tipo PERDA. O motivo ja vem escrito na
// descricao pelo proprio fechamento ("Negocio perdido: Achou caro — obs"), entao
// aqui NAO se faz parsing de dado: o texto e exibido como foi gravado, so sem o
// prefixo repetitivo. Nada e recalculado nem reinterpretado.
//
// AS DUAS FINALIDADES entram. Uma perda de pos-venda tambem e um atendimento que
// nao converteu, e o painel do cliente e sobre o CLIENTE, nao sobre um funil.
// (O historico de COMPRAS conta so VENDA, por outro motivo: la o ganho de
// pos-venda pode ser duvida ou garantia, que nao sao compra.)
//
// FORA os duplicados NEUTRALIZADOS por /api/admin/corrigir-duplicados: aquele
// negocio virou "perdido" so para sair da carteira, nao porque o cliente
// desistiu. Contar como perda seria acusar o vendedor de algo que nao houve —
// a mesma exclusao que lib/perdidos e lib/compras ja fazem.
//
// SOMENTE LEITURA: este modulo nao escreve nada. Historico nao se apaga.
import { prisma } from "./prisma";
import { ehDuplicadoNeutralizado } from "./motivosPerda";
import { TipoHistorico } from "../generated/prisma/enums";

export type PerdaItem = {
  data: Date;
  // Motivo como foi gravado no fechamento, sem o prefixo "Negocio perdido: ".
  motivo: string;
  finalidade: "VENDA" | "POS_VENDA";
};

export type ResumoPerdas = {
  qtd: number;
  perdas: PerdaItem[];
  // Quantas ficaram fora da lista enviada (qtd - perdas.length).
  mais: number;
};

// Teto do payload: o painel mostra as ultimas perdas, nao um extrato.
const LIMITE_LISTA = 10;

const PREFIXO = "Negocio perdido: ";

// Tira o prefixo que toda descricao de perda tem, para a lista nao repetir
// "Negocio perdido" em cada linha. Texto fora do padrao (legado) passa inteiro:
// melhor uma linha feia do que uma linha truncada errada.
function motivoLegivel(descricao: string): string {
  const t = descricao.trim();
  return t.startsWith(PREFIXO) ? t.slice(PREFIXO.length).trim() : t;
}

export async function resumoPerdasDoLead(
  leadId: string,
): Promise<ResumoPerdas> {
  const eventos = await prisma.historicoNegocio.findMany({
    where: {
      tipo: TipoHistorico.PERDA,
      // Arquivados incluidos: perda antiga continua sendo perda depois de o card
      // sair do quadro.
      negocio: { leadId },
    },
    orderBy: { criadoEm: "desc" },
    select: {
      criadoEm: true,
      descricao: true,
      negocio: {
        select: {
          finalidade: true,
          motivoPerda: true,
          motivoPerdaObs: true,
        },
      },
    },
  });

  // Filtro em JS (e nao no WHERE) porque "diferente de" com colunas nulas em SQL
  // cai na logica de tres valores; aqui a comparacao e exata. Sao poucas linhas
  // por cliente.
  const perdas: PerdaItem[] = eventos
    .filter((e) => !ehDuplicadoNeutralizado(e.negocio))
    .map((e) => ({
      data: e.criadoEm,
      motivo: motivoLegivel(e.descricao),
      finalidade: e.negocio.finalidade,
    }));

  return {
    qtd: perdas.length,
    perdas: perdas.slice(0, LIMITE_LISTA),
    mais: Math.max(0, perdas.length - LIMITE_LISTA),
  };
}

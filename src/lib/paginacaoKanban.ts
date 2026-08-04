// Fatia Q — regras de PAGINACAO das colunas do Kanban, em um lugar so.
// Ficam fora da rota para que a medicao (scripts/medirFatiaQ.ts) exercite
// EXATAMENTE o mesmo criterio que /api/negocios usa, e nao uma copia que pode
// divergir depois.
import type { Prisma } from "@/generated/prisma/client";
import { Finalidade, TipoEtapa } from "@/generated/prisma/enums";

// Cards carregados por coluna a cada lote. O cabecalho segue mostrando o TOTAL
// real (resumo da Fatia P), entao limitar a lista nao esconde tamanho de funil.
export const LIMITE_PADRAO = 50;
export const LIMITE_MAX = 100;
// Teto das fixadas trazidas de uma vez (elas nao consomem a cota do lote). Pin e
// acao manual e rara; o teto so existe para nao virar carga ilimitada.
export const TETO_FIXADAS = 200;

// Ordenacao DETERMINISTICA da coluna (o "carregar mais" nao repete nem pula):
// desempate final sempre por id desc.
//
// Bloco 4 — nas colunas TERMINAIS (Vendido/Perdido) o criterio passa a ser a
// ULTIMA MENSAGEM: quem voltou a falar sobe ao topo, para o vendedor ver de
// cara quem interagiu depois de fechado. Quem nunca teve mensagem (null) cai
// para o fim e e ordenado pelo fechamento, como antes.
//
// TODAS as colunas sobem por ultima mensagem: as ABERTAS passam a usar o MESMO
// criterio das terminais — o cliente mandou mensagem, o card sobe ao topo da
// coluna ONDE ELE ESTA (a etapa nao muda; ordenar nao e mover). O desempate
// segue a entrada na etapa, entao quem nunca teve mensagem (ultimaMensagemEm
// null) cai para o fim exatamente na ordem de antes.
export function ordemDaEtapa(
  tipo: TipoEtapa,
): Prisma.NegocioOrderByWithRelationInput[] {
  if (tipo === TipoEtapa.GANHO || tipo === TipoEtapa.PERDIDO) {
    return [
      { ultimaMensagemEm: { sort: "desc", nulls: "last" } },
      { fechadoEm: { sort: "desc", nulls: "last" } },
      { atualizadoEm: "desc" },
      { id: "desc" },
    ];
  }
  return [
    { ultimaMensagemEm: { sort: "desc", nulls: "last" } },
    { entrouEtapaEm: "desc" },
    { id: "desc" },
  ];
}

// "Card fixado" = o lead tem conversa nao arquivada, da MESMA finalidade do
// negocio, com fixadaEm != null (e a regra que `cardNegocio` usa para o pin).
// Prisma nao correlaciona negocio.finalidade com conversa.finalidade, entao
// abrimos um ramo por finalidade visivel (1 ou 2) — o OR fica exato.
export function ramosFixadas(
  finalidades: Finalidade[],
): Prisma.NegocioWhereInput[] {
  return finalidades.map((f) => ({
    finalidade: f,
    lead: {
      conversas: {
        some: { arquivada: false, finalidade: f, fixadaEm: { not: null } },
      },
    },
  }));
}

// Uma coluna = as FIXADAS (topo, fora da cota) + o fluxo das NAO FIXADAS, que e
// o unico paginado. Os conjuntos sao disjuntos: o "carregar mais" nunca devolve
// um card que ja esta na tela.
export function particoesFixadas(finalidades: Finalidade[]): {
  soFixadas: Prisma.NegocioWhereInput;
  semFixadas: Prisma.NegocioWhereInput;
} {
  const ramos = ramosFixadas(finalidades);
  return { soFixadas: { OR: ramos }, semFixadas: { NOT: { OR: ramos } } };
}

// Normaliza os parametros de paginacao vindos da querystring.
export function lerPaginacao(sp: URLSearchParams): {
  offset: number;
  limite: number;
} {
  const offset = Math.max(0, Math.trunc(Number(sp.get("offset") ?? 0)) || 0);
  const bruto = Math.trunc(Number(sp.get("limite") ?? LIMITE_PADRAO));
  const limite = Number.isFinite(bruto)
    ? Math.min(LIMITE_MAX, Math.max(1, bruto || LIMITE_PADRAO))
    : LIMITE_PADRAO;
  return { offset, limite };
}

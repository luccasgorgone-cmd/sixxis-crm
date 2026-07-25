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
// terminais pelo fechamento, ativas pela entrada na etapa; desempate por id desc.
export function ordemDaEtapa(
  tipo: TipoEtapa,
): Prisma.NegocioOrderByWithRelationInput[] {
  if (tipo === TipoEtapa.GANHO || tipo === TipoEtapa.PERDIDO) {
    return [
      { fechadoEm: { sort: "desc", nulls: "last" } },
      { atualizadoEm: "desc" },
      { id: "desc" },
    ];
  }
  return [{ entrouEtapaEm: "desc" }, { id: "desc" }];
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

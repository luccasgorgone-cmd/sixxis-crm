// HISTORICO DE COMPRAS do cliente: quantas vezes comprou, quanto comprou no
// total e a lista resumida (data + valor de cada compra). Usado pelo painel do
// cliente no Kanban e no Inbox.
//
// FONTE: os eventos HistoricoNegocio do tipo GANHO. Como um lead + finalidade
// tem UM negocio, que e REUSADO quando o cliente volta, cada venda ao longo do
// tempo deixa um evento de ganho no MESMO negocio — a lista desses eventos e o
// historico de compras. O valor vem de valorGanho (numero), nunca do texto.
//
// SO CONTA VENDA. O ganho de POS-VENDA ("Resolvido") nem sempre e compra: pode
// ser duvida ou garantia (ver TipoGanho). O tipo fica em Negocio.tipoGanho, que
// guarda so o ULTIMO fechamento — nao da para atribuir tipo a cada evento
// passado. Entao, para o total nunca mentir para mais, pos-venda fica de fora
// inteiro; "total comprado" = vendas.
//
// FORA TAMBEM os duplicados NEUTRALIZADOS por /api/admin/corrigir-duplicados:
// o historico deles continua no banco (nada e deletado), e sem este filtro a
// mesma venda apareceria duas vezes na lista e no total — a dobra que a
// correcao existe para tirar.
import { prisma } from "./prisma";
import { ehDuplicadoNeutralizado } from "./motivosPerda";
import { TipoHistorico, Finalidade } from "../generated/prisma/enums";

export type CompraItem = {
  // null = compra antiga cujo valor nao pode ser recuperado do texto no
  // backfill. Aparece na lista como "valor nao registrado" e NAO entra na soma.
  valor: number | null;
  data: Date;
};

export type ResumoCompras = {
  qtd: number;
  total: number;
  // Quantas das qtd compras estao sem valor estruturado — o total e a soma das
  // demais, entao a UI avisa que ele e um MINIMO quando isto e > 0.
  semValor: number;
  compras: CompraItem[];
  // Quantas compras ficaram fora da lista enviada (qtd - compras.length).
  mais: number;
};

// Teto do payload: o painel mostra as ultimas compras, nao um extrato.
const LIMITE_LISTA = 10;

export async function resumoComprasDoLead(
  leadId: string,
): Promise<ResumoCompras> {
  const eventos = await prisma.historicoNegocio.findMany({
    where: {
      tipo: TipoHistorico.GANHO,
      // Todos os negocios de VENDA do lead, arquivados ou nao: compra antiga
      // continua sendo compra depois de o card sair do quadro.
      negocio: { leadId, finalidade: Finalidade.VENDA },
    },
    orderBy: { criadoEm: "desc" },
    select: {
      criadoEm: true,
      valorGanho: true,
      negocio: { select: { motivoPerda: true, motivoPerdaObs: true } },
    },
  });

  // Filtro em JS (e nao no WHERE) porque "diferente de" com colunas nulas em SQL
  // cai na logica de tres valores; aqui a comparacao e exata. A lista de ganhos
  // de um cliente tem um punhado de linhas, entao nao ha custo nisso.
  const compras: CompraItem[] = eventos
    .filter((e) => !ehDuplicadoNeutralizado(e.negocio))
    .map((e) => ({
      valor: e.valorGanho != null ? Number(e.valorGanho) : null,
      data: e.criadoEm,
    }));

  const total = compras.reduce((s, c) => s + (c.valor ?? 0), 0);
  return {
    qtd: compras.length,
    total,
    semValor: compras.filter((c) => c.valor === null).length,
    compras: compras.slice(0, LIMITE_LISTA),
    mais: Math.max(0, compras.length - LIMITE_LISTA),
  };
}

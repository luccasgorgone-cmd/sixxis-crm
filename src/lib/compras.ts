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

// ---------------------------------------------------------------------------
// FONTE UNICA (Fatia 8). O painel do cliente (1 lead), o filtro da aba Clientes
// e o filtro do mapa (N leads) passam TODOS por aqui: mesmo WHERE, mesmo select,
// mesma conversao de valor, mesmo descarte de duplicado. E o que garante que o
// "total comprado" do painel e o "total gasto" dos filtros sejam o MESMO numero
// para o mesmo cliente — a exigencia do dono nesta fatia.
// ---------------------------------------------------------------------------

// So eventos de GANHO em negocios de VENDA do(s) lead(s). Arquivados incluidos:
// compra antiga continua sendo compra depois de o card sair do quadro.
function whereGanhosVenda(leadIds: string[]) {
  return {
    tipo: TipoHistorico.GANHO,
    negocio: {
      leadId: leadIds.length === 1 ? leadIds[0] : { in: leadIds },
      finalidade: Finalidade.VENDA,
    },
  };
}

const SELECT_GANHO = {
  criadoEm: true,
  valorGanho: true,
  negocio: {
    select: { leadId: true, motivoPerda: true, motivoPerdaObs: true },
  },
} as const;

type EventoGanho = {
  criadoEm: Date;
  // Decimal do Prisma; convertido so por valorDaCompra.
  valorGanho: unknown;
  negocio: {
    leadId: string;
    motivoPerda: string | null;
    motivoPerdaObs: string | null;
  };
};

// null = compra antiga sem valor estruturado (backfill nao casou). NUNCA vira 0:
// o zero somaria silenciosamente e faria o total mentir para menos sem avisar.
function valorDaCompra(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v as number);
  return Number.isFinite(n) ? n : null;
}

// Descarta os duplicados NEUTRALIZADOS por /api/admin/corrigir-duplicados. Em JS
// e nao no WHERE porque "diferente de" com colunas nulas em SQL cai na logica de
// tres valores; aqui a comparacao e exata. Sao poucas linhas por cliente.
function comprasDosEventos(eventos: EventoGanho[]): CompraItem[] {
  return eventos
    .filter((e) => !ehDuplicadoNeutralizado(e.negocio))
    .map((e) => ({ valor: valorDaCompra(e.valorGanho), data: e.criadoEm }));
}

// Total gasto = soma das compras COM valor. As sem valor entram so na contagem.
function somar(compras: CompraItem[]): { total: number; semValor: number } {
  let total = 0;
  let semValor = 0;
  for (const c of compras) {
    if (c.valor == null) semValor++;
    else total += c.valor;
  }
  return { total, semValor };
}

export async function resumoComprasDoLead(
  leadId: string,
): Promise<ResumoCompras> {
  const eventos = await prisma.historicoNegocio.findMany({
    where: whereGanhosVenda([leadId]),
    orderBy: { criadoEm: "desc" },
    select: SELECT_GANHO,
  });

  const compras = comprasDosEventos(eventos);
  const { total, semValor } = somar(compras);
  return {
    qtd: compras.length,
    total,
    semValor,
    compras: compras.slice(0, LIMITE_LISTA),
    mais: Math.max(0, compras.length - LIMITE_LISTA),
  };
}

// Quanto CADA lead ja gastou. Mesmo criterio do painel, em lote.
export type GastoLead = {
  // Soma das compras com valor estruturado.
  total: number;
  // Quantas compras (inclui as sem valor).
  qtd: number;
  // Quantas ficaram fora do total por nao ter valor estruturado.
  semValor: number;
};

// Lote maximo por consulta. O IN cresce com o numero de leads da tela; quebrar
// em pedacos mantem a query com tamanho previsivel em vez de um IN gigante.
const LOTE = 500;

// Devolve um Map leadId -> GastoLead, so com quem TEM ganho de venda. Lead
// ausente do Map = nunca comprou (total 0) — quem chama trata com ?? 0, e por
// isso a consulta ja sai naturalmente pre-filtrada em "tem pelo menos 1 ganho".
export async function totalGastoPorLead(
  leadIds: string[],
): Promise<Map<string, GastoLead>> {
  const porLead = new Map<string, GastoLead>();
  if (leadIds.length === 0) return porLead;

  // Unico: o mesmo lead duas vezes na entrada dobraria as linhas lidas.
  const unicos = [...new Set(leadIds)];

  for (let i = 0; i < unicos.length; i += LOTE) {
    const lote = unicos.slice(i, i + LOTE);
    const eventos = await prisma.historicoNegocio.findMany({
      where: whereGanhosVenda(lote),
      select: SELECT_GANHO,
    });

    // Agrupa por lead e reusa o MESMO somatorio do painel.
    const porLeadLote = new Map<string, EventoGanho[]>();
    for (const e of eventos) {
      const atual = porLeadLote.get(e.negocio.leadId);
      if (atual) atual.push(e);
      else porLeadLote.set(e.negocio.leadId, [e]);
    }
    for (const [leadId, evts] of porLeadLote) {
      const compras = comprasDosEventos(evts);
      if (compras.length === 0) continue;
      const { total, semValor } = somar(compras);
      porLead.set(leadId, { total, qtd: compras.length, semValor });
    }
  }

  return porLead;
}

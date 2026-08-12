// Localizar o negocio de VENDA de um cliente pelo TELEFONE, para correcoes
// pontuais e nominais do admin (Fatia 12).
//
// POR QUE NAO SERVE A BUSCA DA TELA: /api/clientes trunca em 500, esconde
// arquivado=false e filtra o texto no navegador. Uma correcao nominal precisa
// achar EXATAMENTE o cliente pedido, mesmo que ele esteja arquivado ou fora do
// recorte — senao a correcao pula gente sem ninguem perceber.
//
// AQUI NAO SE FILTRA arquivado: quem corrige precisa enxergar tudo. Quem chama
// decide o que fazer com um negocio arquivado.
import { prisma } from "./prisma";
import { variantesTelefoneBR } from "./phone";
import { nomeEfetivo } from "./cliente";
import { ehGanhoDesconsiderado } from "./compras";
import { Finalidade, TipoHistorico } from "../generated/prisma/enums";

export type NegocioPorTelefone = {
  negocioId: string;
  leadId: string;
  cliente: string;
  telefone: string;
  status: "ABERTO" | "GANHO" | "PERDIDO";
  etapa: { id: string; nome: string; tipo: string } | null;
  valor: number | null;
  arquivado: boolean;
  // MEMORIA do ganho: o negocio ja foi ganho alguma vez, mesmo que hoje esteja
  // ABERTO (o cliente voltou a falar e o card reabriu).
  jaFoiGanho: boolean;
  ultimoGanhoEm: string | null;
  // Eventos GANHO que AINDA valem no historico (os desconsiderados pela Fatia 9
  // nao entram — repeticao de movimentacao nao e prova de venda).
  ganhosNoHistorico: number;
  // Data do ganho mais recente do historico. Serve de fallback para fechadoEm
  // quando ultimoGanhoEm nao existe.
  ultimoGanhoHistoricoEm: string | null;
};

function numeroOuNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Todos os negocios de VENDA dos leads cujo telefone casa com o informado (em
// qualquer variante: com/sem o 9, com/sem DDI). Lista vazia = ninguem achado.
export async function buscarNegociosVendaPorTelefone(
  telefone: string,
): Promise<NegocioPorTelefone[]> {
  const variantes = variantesTelefoneBR(telefone);
  if (variantes.length === 0) return [];

  const leads = await prisma.lead.findMany({
    where: { telefone: { in: variantes } },
    select: {
      id: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      negocios: {
        where: { finalidade: Finalidade.VENDA },
        select: {
          id: true,
          status: true,
          valor: true,
          arquivado: true,
          jaFoiGanho: true,
          ultimoGanhoEm: true,
          etapa: { select: { id: true, nome: true, tipo: true } },
        },
      },
    },
  });

  const negocioIds = leads.flatMap((l) => l.negocios.map((n) => n.id));
  if (negocioIds.length === 0) return [];

  // Os eventos de ganho desses negocios. Consulta separada (e nao _count com
  // filtro) para poder descartar em JS os desconsiderados pela Fatia 9 — o
  // marcador deles e um sufixo no texto, que nao cabe num contador do banco.
  const eventos = await prisma.historicoNegocio.findMany({
    where: { negocioId: { in: negocioIds }, tipo: TipoHistorico.GANHO },
    orderBy: { criadoEm: "desc" },
    select: { negocioId: true, criadoEm: true, descricao: true },
  });
  const porNegocio = new Map<string, { qtd: number; ultimo: Date }>();
  for (const e of eventos) {
    if (ehGanhoDesconsiderado(e.descricao)) continue;
    const atual = porNegocio.get(e.negocioId);
    // eventos vem em ordem desc, entao o primeiro visto e o mais recente.
    if (atual) atual.qtd++;
    else porNegocio.set(e.negocioId, { qtd: 1, ultimo: e.criadoEm });
  }

  const saida: NegocioPorTelefone[] = [];
  for (const l of leads) {
    for (const n of l.negocios) {
      const g = porNegocio.get(n.id);
      saida.push({
        negocioId: n.id,
        leadId: l.id,
        cliente: nomeEfetivo(l),
        telefone: l.telefone,
        status: n.status,
        etapa: n.etapa
          ? { id: n.etapa.id, nome: n.etapa.nome, tipo: n.etapa.tipo }
          : null,
        valor: numeroOuNull(n.valor),
        arquivado: n.arquivado,
        jaFoiGanho: n.jaFoiGanho,
        ultimoGanhoEm: n.ultimoGanhoEm?.toISOString() ?? null,
        ganhosNoHistorico: g?.qtd ?? 0,
        ultimoGanhoHistoricoEm: g?.ultimo.toISOString() ?? null,
      });
    }
  }
  return saida;
}

// TRAVA da Fatia 12: so restaura ganho onde houve ganho. jaFoiGanho e a memoria
// gravada no proprio negocio; o historico e a prova documental. Basta UM dos
// dois — mas nenhum dos dois significa que nunca houve venda ali, e nesse caso
// marcar GANHO seria INVENTAR faturamento.
export function temGanhoComprovado(n: {
  jaFoiGanho: boolean;
  ganhosNoHistorico: number;
}): boolean {
  return n.jaFoiGanho || n.ganhosNoHistorico > 0;
}

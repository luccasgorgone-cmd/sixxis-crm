// Admin: CORRECAO PONTUAL dos negocios DUPLICADOS. Roda quando o dono aciona —
// nao e job, nao roda no boot nem no deploy.
//
// POR QUE EXISTE: antes da correcao de duplicacao, o mesmo lead podia ganhar um
// SEGUNDO negocio na mesma finalidade (o Negocio nao tem @@unique
// (leadId, finalidade) — so a Conversa tem). A correcao impede novos, mas os
// antigos ficaram. Quando o duplicado esta GANHO isso INFLA O FATURAMENTO: a
// carteira (/api/carteira) soma os ganhos por status=GANHO e nao filtra
// arquivado, entao o mesmo valor entra DUAS VEZES. So arquivar nao resolve —
// arquivado continua GANHO e continua sendo somado. Por isso o duplicado precisa
// DEIXAR de ser GANHO.
//
// O QUE FAZ EM CADA GRUPO (mesmo leadId + finalidade, 2+ nao arquivados):
//   MANTIDO   = maior valor; empate -> atualizadoEm mais recente -> criadoEm.
//               NAO e tocado em nada.
//   OS DEMAIS = status PERDIDO + motivoPerda "CONTATO_ERRADO" ("Contato errado /
//               duplicado", code que ja existia) + obs "Duplicado corrigido
//               automaticamente" + arquivado/arquivadoEm. Sai da carteira, sai
//               do Kanban, e o registro continua inteiro.
//
// ZERO DELETE: nada e apagado. Historico, orcamentos, pagamentos, itens e
// mensagens do duplicado continuam no banco e ligados a ele.
//
// A CONVERSA: um lead+finalidade tem UMA conversa (indice unico parcial), que e
// COMPARTILHADA pelos dois negocios do grupo. Como o MANTIDO segue no quadro,
// arquivar a conversa tiraria do Inbox um cliente que continua no Kanban — o
// desencontro que a fatia anterior corrigiu. Entao a conversa so e arquivada se
// NAO sobrar nenhum negocio ativo naquele lead+finalidade (na pratica, nunca:
// sempre sobra o mantido). A trava fica aqui por seguranca.
//
// GET  = PREVIA: so le e lista, nao escreve nada.
// POST = executa, uma transacao POR GRUPO (nunca deixa os dois ganhos nem os
//        dois neutralizados). IDEMPOTENTE: depois da execucao o grupo fica com
//        um so nao arquivado e nao e mais encontrado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { campoDono } from "@/lib/dono";
import { nomeEfetivo } from "@/lib/cliente";
import { MOTIVO_DUPLICADO, OBS_DUPLICADO_AUTO } from "@/lib/motivosPerda";
import { StatusNeg, Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Os negocios NAO arquivados desses leads. Lista curta (sao poucos grupos).
function buscarNegociosDosLeads(leadIds: string[]) {
  return prisma.negocio.findMany({
    where: { arquivado: false, leadId: { in: leadIds } },
    select: {
      id: true,
      leadId: true,
      finalidade: true,
      status: true,
      valor: true,
      agenteId: true,
      atualizadoEm: true,
      criadoEm: true,
      lead: {
        select: {
          id: true,
          nome: true,
          pushName: true,
          nomeManual: true,
          telefone: true,
          donoId: true,
          donoPosVendaId: true,
        },
      },
    },
  });
}

// Tipo derivado da propria query: se o schema mudar, quebra no build em vez de
// escorregar por um cast.
type NegocioDup = Awaited<ReturnType<typeof buscarNegociosDosLeads>>[number];

type Grupo = {
  leadId: string;
  cliente: string;
  finalidade: Finalidade;
  // Dono do lead NAQUELA finalidade: e por ele que a carteira agrupa (ela filtra
  // por lead.donoId / lead.donoPosVendaId, nao por Negocio.agenteId).
  donoId: string | null;
  quantidade: number;
  mantido: { id: string; valor: number | null; status: StatusNeg };
  neutralizados: {
    id: string;
    valor: number | null;
    status: StatusNeg;
    agenteId: string | null;
  }[];
  // Valor que estava contando EM DOBRO na carteira: soma dos duplicados que
  // estao GANHO. Duplicado ABERTO nao entra (nunca somou faturamento).
  valorEmDobro: number;
};

function numeroOuNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Ordem de escolha do MANTIDO: valor DESC (sem valor por ultimo), depois
// atualizadoEm DESC, depois criadoEm DESC, e o id so para desempate total
// (deixa a previa e a execucao escolherem SEMPRE o mesmo).
function ordenarCandidatos(a: NegocioDup, b: NegocioDup): number {
  const va = numeroOuNull(a.valor);
  const vb = numeroOuNull(b.valor);
  if (va !== vb) {
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  }
  const ta = b.atualizadoEm.getTime() - a.atualizadoEm.getTime();
  if (ta !== 0) return ta;
  const tc = b.criadoEm.getTime() - a.criadoEm.getTime();
  if (tc !== 0) return tc;
  return a.id.localeCompare(b.id);
}

// Levanta os grupos duplicados (leitura pura). Mesma funcao usada pela previa e
// pela execucao — o que o dono ve no GET e exatamente o que o POST faz.
async function levantarGrupos(): Promise<Grupo[]> {
  // 1) Quais (lead, finalidade) tem 2+ negocios NAO arquivados.
  const pares = await prisma.negocio.groupBy({
    by: ["leadId", "finalidade"],
    where: { arquivado: false },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  if (pares.length === 0) return [];

  // 2) Os negocios desses leads.
  const leadIds = [...new Set(pares.map((p) => p.leadId))];
  const negocios = await buscarNegociosDosLeads(leadIds);

  // 3) Agrupa por (lead, finalidade) e fica so com os grupos de 2+.
  const porChave = new Map<string, NegocioDup[]>();
  for (const n of negocios) {
    const chave = `${n.leadId}|${n.finalidade}`;
    const lista = porChave.get(chave);
    if (lista) lista.push(n);
    else porChave.set(chave, [n]);
  }

  const grupos: Grupo[] = [];
  for (const lista of porChave.values()) {
    if (lista.length < 2) continue;
    const ordenados = [...lista].sort(ordenarCandidatos);
    const [mantido, ...resto] = ordenados;
    grupos.push({
      leadId: mantido.leadId,
      cliente: nomeEfetivo(mantido.lead),
      finalidade: mantido.finalidade,
      donoId: mantido.lead[campoDono(mantido.finalidade)],
      quantidade: lista.length,
      mantido: {
        id: mantido.id,
        valor: numeroOuNull(mantido.valor),
        status: mantido.status,
      },
      neutralizados: resto.map((n) => ({
        id: n.id,
        valor: numeroOuNull(n.valor),
        status: n.status,
        agenteId: n.agenteId,
      })),
      valorEmDobro: resto
        .filter((n) => n.status === StatusNeg.GANHO)
        .reduce((s, n) => s + (numeroOuNull(n.valor) ?? 0), 0),
    });
  }
  return grupos;
}

// Impacto por vendedor = dono do lead na finalidade (criterio da carteira).
async function porVendedor(grupos: Grupo[]) {
  const soma = new Map<string, number>();
  for (const g of grupos) {
    if (g.valorEmDobro <= 0) continue;
    const chave = g.donoId ?? "";
    soma.set(chave, (soma.get(chave) ?? 0) + g.valorEmDobro);
  }
  const ids = [...soma.keys()].filter(Boolean);
  const agentes = ids.length
    ? await prisma.agente.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true },
      })
    : [];
  const nomes = new Map(agentes.map((a) => [a.id, a.nome]));
  return [...soma.entries()]
    .map(([id, valor]) => ({
      agenteId: id || null,
      nome: id ? (nomes.get(id) ?? "(agente removido)") : "(sem dono)",
      valorEmDobro: valor,
    }))
    .sort((a, b) => b.valorEmDobro - a.valorEmDobro);
}

function totalEmDobro(grupos: Grupo[]): number {
  return grupos.reduce((s, g) => s + g.valorEmDobro, 0);
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const grupos = await levantarGrupos();
  return NextResponse.json({
    previa: {
      grupos,
      totalGrupos: grupos.length,
      valorEmDobro: totalEmDobro(grupos),
      porVendedor: await porVendedor(grupos),
    },
    executado: false,
  });
}

export async function POST(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  try {
    const grupos = await levantarGrupos();
    const agora = new Date();
    const aplicados: Grupo[] = [];
    const pulados: { leadId: string; finalidade: Finalidade; motivo: string }[] =
      [];
    let neutralizados = 0;
    let conversasArquivadas = 0;

    for (const g of grupos) {
      const resultado = await prisma.$transaction(async (tx) => {
        // Relê DENTRO da transacao: se algo mudou entre a leitura e agora (o job
        // de prazo, outro admin), o grupo e PULADO em vez de arriscar deixar o
        // lead sem nenhum negocio ativo.
        const atuais = await tx.negocio.findMany({
          where: {
            leadId: g.leadId,
            finalidade: g.finalidade,
            arquivado: false,
          },
          select: { id: true },
        });
        const idsAtuais = new Set(atuais.map((n) => n.id));
        if (atuais.length < 2 || !idsAtuais.has(g.mantido.id)) {
          return { pulado: "grupo mudou desde a leitura", neutralizados: 0, conversas: 0 };
        }
        const alvos = g.neutralizados
          .map((n) => n.id)
          .filter((id) => idsAtuais.has(id));
        if (alvos.length === 0) {
          return { pulado: "nada a neutralizar", neutralizados: 0, conversas: 0 };
        }

        // O MANTIDO nunca entra neste updateMany (nao esta em `alvos`).
        const upd = await tx.negocio.updateMany({
          where: { id: { in: alvos }, arquivado: false },
          data: {
            status: StatusNeg.PERDIDO,
            motivoPerda: MOTIVO_DUPLICADO,
            motivoPerdaObs: OBS_DUPLICADO_AUTO,
            arquivado: true,
            arquivadoEm: agora,
          },
        });

        // Conversa: so sai do Inbox se NAO sobrar negocio ativo no lead+setor.
        // Com o mantido de pe isto e no-op — e assim tem que ser.
        const sobraram = await tx.negocio.count({
          where: {
            leadId: g.leadId,
            finalidade: g.finalidade,
            arquivado: false,
          },
        });
        let conversas = 0;
        if (sobraram === 0) {
          const c = await tx.conversa.updateMany({
            where: {
              leadId: g.leadId,
              finalidade: g.finalidade,
              arquivada: false,
            },
            data: { arquivada: true },
          });
          conversas = c.count;
        }
        return { pulado: null as string | null, neutralizados: upd.count, conversas };
      });

      if (resultado.pulado) {
        pulados.push({
          leadId: g.leadId,
          finalidade: g.finalidade,
          motivo: resultado.pulado,
        });
        continue;
      }
      neutralizados += resultado.neutralizados;
      conversasArquivadas += resultado.conversas;
      aplicados.push(g);
    }

    const valorRemovidoDaDobra = totalEmDobro(aplicados);
    console.log(
      `[corrigir-duplicados] ${aplicados.length} grupos corrigidos, ` +
        `${neutralizados} duplicados neutralizados (PERDIDO/${MOTIVO_DUPLICADO} + arquivado), ` +
        `${conversasArquivadas} conversas arquivadas, ` +
        `R$ ${valorRemovidoDaDobra.toFixed(2)} sai da dobra da carteira, ` +
        `${pulados.length} pulados — por ${admin.nome ?? admin.id} — nada foi deletado`,
    );

    return NextResponse.json({
      executado: true,
      grupos: aplicados,
      totalGrupos: aplicados.length,
      neutralizados,
      conversasArquivadas,
      valorRemovidoDaDobra,
      porVendedor: await porVendedor(aplicados),
      pulados,
    });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao corrigir duplicados",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}

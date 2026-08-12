// Admin: quantos atendimentos cada vendedor ENCERROU NA MAO no periodo.
//
// POR QUE EXISTE: a Fatia 10 deu ao vendedor um botao que tira o card do quadro
// sem marcar venda nem perda. Isso e legitimo (cliente que volta por uma duvida
// pontual), mas e tambem a saida mais facil para se livrar de um atendimento.
// O dado ja era gravado em Negocio.arquivadoMotivo e so existia via SQL; aqui
// ele vira numero por vendedor, que e o que deixa um exagero visivel.
//
// SOMENTE LEITURA: nenhuma escrita, nenhuma migracao, nada deletado. Nao roda no
// boot — responde quando a tela de relatorios pergunta.
//
// PERIODO: mesmo contrato da carteira e do dashboard
// (?periodo=hoje|semana|15d|mes ou ?inicio=&fim=), pela mesma resolverPeriodo —
// entao o seletor da tela de relatorios serve esta rota sem tradutor no meio.
// O relogio e arquivadoEm: QUANDO o card foi encerrado.
//
// O DONO DO ATENDIMENTO e o do LEAD na finalidade (donoId para venda,
// donoPosVendaId para pos-venda, via campoDono) — o mesmo criterio pelo qual a
// carteira e a correcao de duplicados montam "por vendedor". NAO e
// Negocio.agenteId: um card transferido continua contando para quem responde
// pelo cliente hoje, que e como o resto do sistema le "de quem e este cliente".
//
// RECORTE HISTORICO: so conta quem tem arquivadoMotivo = 'MANUAL' explicito.
// Tudo que foi arquivado ANTES da Fatia 10 esta com null (origem desconhecida) e
// fica de fora — nao da para saber se saiu pelo prazo ou na mao, e chutar
// encheria o relatorio de acusacao inventada. Por isso a resposta carrega
// `desde`: a data do primeiro encerramento manual registrado, para a tela poder
// dizer de quando em diante o numero e confiavel.
//
// GET /api/admin/encerramentos-manuais[?periodo=|&inicio=&fim=]
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { campoDono } from "@/lib/dono";
import { resolverPeriodo } from "@/lib/metricas";
import { ARQUIVO_MANUAL } from "@/lib/arquivamento";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LinhaVendedor = {
  // null = o lead nao tem dono naquela finalidade.
  agenteId: string | null;
  nome: string;
  avatarUrl: string | null;
  total: number;
  venda: number;
  posVenda: number;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const { inicio, fim } = resolverPeriodo(
    sp.get("periodo"),
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );

  // Os encerramentos do periodo + a data do primeiro de todos (fora do periodo,
  // de proposito: e a data em que o recurso passou a existir).
  const [encerrados, primeiro] = await Promise.all([
    prisma.negocio.findMany({
      where: {
        arquivado: true,
        arquivadoMotivo: ARQUIVO_MANUAL,
        arquivadoEm: { gte: inicio, lte: fim },
      },
      select: {
        finalidade: true,
        lead: { select: { donoId: true, donoPosVendaId: true } },
      },
    }),
    prisma.negocio.aggregate({
      where: { arquivadoMotivo: ARQUIVO_MANUAL },
      _min: { arquivadoEm: true },
    }),
  ]);

  // Agregacao em memoria porque o dono mora no LEAD e o groupBy do Prisma so
  // agrupa por colunas do proprio Negocio. Encerramento manual e um ato raro
  // (um clique deliberado por atendimento), entao o volume aqui e pequeno.
  const contagem = new Map<string, { venda: number; posVenda: number }>();
  for (const n of encerrados) {
    const donoId = n.lead[campoDono(n.finalidade)];
    const chave = donoId ?? "";
    const atual = contagem.get(chave) ?? { venda: 0, posVenda: 0 };
    if (n.finalidade === Finalidade.VENDA) atual.venda++;
    else atual.posVenda++;
    contagem.set(chave, atual);
  }

  const ids = [...contagem.keys()].filter(Boolean);
  const agentes = ids.length
    ? await prisma.agente.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true, avatarUrl: true },
      })
    : [];
  const porId = new Map(agentes.map((a) => [a.id, a]));

  const porVendedor: LinhaVendedor[] = [...contagem.entries()]
    .map(([id, c]) => {
      const a = id ? porId.get(id) : null;
      return {
        agenteId: id || null,
        nome: id ? (a?.nome ?? "(colaborador removido)") : "(sem dono)",
        avatarUrl: a?.avatarUrl ?? null,
        total: c.venda + c.posVenda,
        venda: c.venda,
        posVenda: c.posVenda,
      };
    })
    // Maior primeiro: o exagero e o que o dono abriu a tela para ver. Empate
    // pelo nome, para a ordem nao dancar entre duas cargas iguais.
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));

  return NextResponse.json({
    periodo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
    total: encerrados.length,
    porVendedor,
    // null = nenhum encerramento manual registrado ainda em todo o sistema.
    desde: primeiro._min.arquivadoEm?.toISOString() ?? null,
    // Dito no payload para a tela nao ter que saber desta regra por conta.
    observacao:
      "Conta apenas encerramentos manuais registrados a partir da entrada do recurso. " +
      "Negocios arquivados antes disso nao guardam a origem e ficam de fora.",
  });
}

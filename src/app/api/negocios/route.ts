// Lista os negocios para o Kanban, agrupados por etapa, filtrados por papel.
// VENDEDOR/POS_VENDA: somente os proprios. ADMIN: todos, com filtro
// meus|todos|sem_dono e agenteId opcional.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { includeCard, cardNegocio } from "@/lib/serializar";
import { janelaDeParams } from "@/lib/metricas";
import { compararPin } from "@/lib/ordenacao";
import { normalizarTexto } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { Temperatura, Finalidade, FinalidadeEtapa } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const filtro = sp.get("filtro") ?? "todos";
  const etiquetaId = sp.get("etiquetaId") ?? "";
  const temperatura = sp.get("temperatura") ?? "";
  const agenteIdFiltro = sp.get("agenteId") ?? "";
  const busca = sp.get("busca")?.trim() ?? "";
  const fParam = sp.get("finalidade");
  const admin = ehAdmin(agente.papel);

  const where: Prisma.NegocioWhereInput = {};

  // Finalidades visiveis:
  //  - ADMIN: a do parametro (alterna Vendas|Pos-venda).
  //  - Colaborador: SO as que ele tem acesso (1 -> funil unico; 2 -> uniao).
  //    O colaborador nunca escolhe finalidade.
  let finalidades: Finalidade[];
  if (admin) {
    finalidades = [
      fParam === Finalidade.POS_VENDA ? Finalidade.POS_VENDA : Finalidade.VENDA,
    ];
  } else {
    const eu = await prisma.agente.findUnique({
      where: { id: agente.id },
      select: { acessoVenda: true, acessoPosVenda: true },
    });
    finalidades = [];
    if (eu?.acessoVenda) finalidades.push(Finalidade.VENDA);
    if (eu?.acessoPosVenda) finalidades.push(Finalidade.POS_VENDA);
    if (finalidades.length === 0) finalidades = [Finalidade.VENDA];
  }
  where.finalidade = { in: finalidades };

  // Regra de papel.
  if (!admin) {
    where.agenteId = agente.id;
  } else if (filtro === "meus") {
    where.agenteId = agente.id;
  } else if (filtro === "sem_dono") {
    where.agenteId = null;
  } else if (agenteIdFiltro) {
    where.agenteId = agenteIdFiltro;
  }

  // Temperatura.
  if (temperatura && temperatura in Temperatura) {
    where.temperatura = temperatura as Temperatura;
  }

  // Periodo opcional: filtra por QUANDO o atendimento/negocio ENTROU =
  // negocio.criadoEm (hoje|7d|15d|30d|custom). Combina com escopo/finalidade (AND).
  const janela = janelaDeParams(sp);
  if (janela) {
    where.criadoEm = { gte: janela.inicio, lte: janela.fim };
  }

  // Filtros sobre o lead (etiqueta + busca), server-side (Fatia P). A busca casa,
  // como no client de antes, por: NOME EFETIVO (via nomeBusca normalizado, sem
  // acento) + os campos crus (cinto-e-suspensorio, caso nomeBusca esteja stale) +
  // TELEFONE (digitos) + CONTEUDO das conversas (mensagens), escopado as
  // finalidades visiveis.
  const leadWhere: Prisma.LeadWhereInput = {};
  if (etiquetaId) {
    leadWhere.etiquetas = { some: { etiquetaId } };
  }
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    const buscaNorm = normalizarTexto(busca);
    const ors: Prisma.LeadWhereInput[] = [
      { nomeBusca: { contains: buscaNorm } },
      { nome: { contains: busca, mode: "insensitive" } },
      { nomeManual: { contains: busca, mode: "insensitive" } },
      { pushName: { contains: busca, mode: "insensitive" } },
      // Conteudo das conversas (mesma semantica do /api/conversas?texto=).
      {
        conversas: {
          some: {
            finalidade: { in: finalidades },
            mensagens: { some: { conteudo: { contains: busca, mode: "insensitive" } } },
          },
        },
      },
    ];
    if (digitos) ors.push({ telefone: { contains: digitos } });
    leadWhere.OR = ors;
  }
  if (Object.keys(leadWhere).length > 0) {
    where.lead = leadWhere;
  }

  // Etapas: uniao das finalidades visiveis (+ AMBAS, se houver alguma legada).
  const finalidadeEtapas: FinalidadeEtapa[] = [FinalidadeEtapa.AMBAS];
  if (finalidades.includes(Finalidade.VENDA)) {
    finalidadeEtapas.push(FinalidadeEtapa.VENDA);
  }
  if (finalidades.includes(Finalidade.POS_VENDA)) {
    finalidadeEtapas.push(FinalidadeEtapa.POS_VENDA);
  }

  // RESUMO por etapa (Fatia P): total (COUNT) e somaValor (SUM) calculados NO
  // BANCO, com EXATAMENTE o mesmo `where` da listagem — nunca a partir dos cards
  // carregados. A soma replica o valor do card = COALESCE(valorAjustado, valor):
  // dois groupBy particionados por valorAjustado (nulo / nao-nulo) e somados.
  // Sem N+1, sem contar em memoria. Fundacao para a paginacao (Fatia Q).
  const [etapas, negocios, aggAjustado, aggValor] = await Promise.all([
    prisma.etapa.findMany({
      where: { ativo: true, finalidade: { in: finalidadeEtapas } },
      orderBy: { ordem: "asc" },
      select: {
        id: true,
        nome: true,
        cor: true,
        tipo: true,
        finalidade: true,
        ordem: true,
      },
    }),
    prisma.negocio.findMany({
      where,
      include: includeCard,
      orderBy: { entrouEtapaEm: "desc" },
    }),
    prisma.negocio.groupBy({
      by: ["etapaId"],
      where: { ...where, valorAjustado: { not: null } },
      _count: { _all: true },
      _sum: { valorAjustado: true },
    }),
    prisma.negocio.groupBy({
      by: ["etapaId"],
      where: { ...where, valorAjustado: null },
      _count: { _all: true },
      _sum: { valor: true },
    }),
  ]);

  // Agrupa por etapaId.
  const colunas: Record<string, ReturnType<typeof cardNegocio>[]> = {};
  for (const e of etapas) colunas[e.id] = [];
  for (const n of negocios) {
    if (n.etapaId && colunas[n.etapaId]) {
      colunas[n.etapaId].push(cardNegocio(n));
    }
  }

  // Fatia Y: fixadas primeiro em cada coluna. O DB ja ordenou por entrouEtapaEm
  // desc; como Array.sort e estavel e compararPin devolve 0 no empate, os cards
  // sem pin mantem essa ordem — o pin so promove os fixados ao topo.
  for (const id of Object.keys(colunas)) {
    colunas[id].sort((a, b) => compararPin(a.fixadaEm, b.fixadaEm));
  }

  // Consolida o resumo por etapa a partir das duas particoes.
  const resumo: Record<string, { total: number; somaValor: number }> = {};
  for (const e of etapas) resumo[e.id] = { total: 0, somaValor: 0 };
  for (const r of aggAjustado) {
    if (r.etapaId && resumo[r.etapaId]) {
      resumo[r.etapaId].total += r._count._all;
      resumo[r.etapaId].somaValor += Number(r._sum.valorAjustado ?? 0);
    }
  }
  for (const r of aggValor) {
    if (r.etapaId && resumo[r.etapaId]) {
      resumo[r.etapaId].total += r._count._all;
      resumo[r.etapaId].somaValor += Number(r._sum.valor ?? 0);
    }
  }

  return NextResponse.json({ etapas, colunas, resumo });
}

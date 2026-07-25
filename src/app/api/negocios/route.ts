// Lista os negocios para o Kanban, agrupados por etapa, filtrados por papel.
// VENDEDOR/POS_VENDA: somente os proprios. ADMIN: todos, com filtro
// meus|todos|sem_dono e agenteId opcional.
//
// Fatia Q — PAGINACAO POR COLUNA. Dois modos, MESMO `where` (fonte unica: os
// filtros valem igual no primeiro lote e no "carregar mais"):
//   1) QUADRO   GET /api/negocios?<filtros>
//      -> { etapas, colunas, resumo, paginacao }
//      Cada coluna traz as FIXADAS (pin, Fatia Y) + ate `limite` nao fixadas.
//   2) COLUNA   GET /api/negocios?<filtros>&etapaId=<id>&offset=<n>[&limite=50]
//      -> { cards, offset, total, temMais }
//      Proxima pagina das NAO FIXADAS daquela coluna (as fixadas ja vieram no
//      quadro e nunca se repetem aqui — os dois conjuntos sao disjuntos).
// O cabecalho da coluna NUNCA usa esta lista: total/soma vem de `resumo` (Fatia P).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { includeCard, cardNegocio } from "@/lib/serializar";
import { janelaDeParams } from "@/lib/metricas";
import { compararPin } from "@/lib/ordenacao";
import { normalizarTexto } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import {
  Temperatura,
  Finalidade,
  FinalidadeEtapa,
  TipoEtapa,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cards carregados por coluna a cada lote. O cabecalho segue mostrando o TOTAL
// real (resumo), entao limitar a lista nao esconde tamanho de funil.
const LIMITE_PADRAO = 50;
const LIMITE_MAX = 100;
// Teto das fixadas trazidas de uma vez (elas nao consomem a cota do lote). Pin e
// acao manual e rara; o teto so existe para nao virar carga ilimitada.
const TETO_FIXADAS = 200;

// Ordenacao DETERMINISTICA da coluna (o "carregar mais" nao repete nem pula):
// terminais pelo fechamento, ativas pela entrada na etapa; desempate por id desc.
function ordemDaEtapa(tipo: TipoEtapa): Prisma.NegocioOrderByWithRelationInput[] {
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
function ramosFixadas(finalidades: Finalidade[]): Prisma.NegocioWhereInput[] {
  return finalidades.map((f) => ({
    finalidade: f,
    lead: {
      conversas: {
        some: { arquivada: false, finalidade: f, fixadaEm: { not: null } },
      },
    },
  }));
}

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

  // Paginacao (Fatia Q): tamanho do lote e cursor por deslocamento.
  const etapaIdParam = sp.get("etapaId") ?? "";
  const offset = Math.max(0, Math.trunc(Number(sp.get("offset") ?? 0)) || 0);
  const limiteBruto = Math.trunc(Number(sp.get("limite") ?? LIMITE_PADRAO));
  const limite = Number.isFinite(limiteBruto)
    ? Math.min(LIMITE_MAX, Math.max(1, limiteBruto || LIMITE_PADRAO))
    : LIMITE_PADRAO;

  const fixadas = ramosFixadas(finalidades);
  // Uma coluna = as FIXADAS (topo, fora da cota) + o fluxo das NAO FIXADAS, que
  // e o unico paginado. Os conjuntos sao disjuntos: o "carregar mais" nunca
  // devolve um card que ja esta na tela.
  const soFixadas: Prisma.NegocioWhereInput = { OR: fixadas };
  const semFixadas: Prisma.NegocioWhereInput = { NOT: { OR: fixadas } };

  // ---- MODO COLUNA: proxima pagina de UMA etapa (botao "Carregar mais") ----
  if (etapaIdParam) {
    const etapa = await prisma.etapa.findFirst({
      where: {
        id: etapaIdParam,
        ativo: true,
        finalidade: { in: finalidadeEtapas },
      },
      select: { id: true, tipo: true },
    });
    if (!etapa) {
      return NextResponse.json({ erro: "etapa nao encontrada" }, { status: 404 });
    }

    const daEtapa: Prisma.NegocioWhereInput = {
      AND: [where, { etapaId: etapa.id }],
    };
    // take = limite + 1: a linha extra diz se ha proxima pagina sem um COUNT
    // adicional (e sem prometer botao quando o resto e exatamente zero).
    const [linhas, total] = await Promise.all([
      prisma.negocio.findMany({
        where: { AND: [daEtapa, semFixadas] },
        include: includeCard,
        orderBy: ordemDaEtapa(etapa.tipo),
        skip: offset,
        take: limite + 1,
      }),
      prisma.negocio.count({ where: daEtapa }),
    ]);
    const temMais = linhas.length > limite;
    const cards = linhas.slice(0, limite).map(cardNegocio);
    // `offset` devolvido = proximo cursor (quantas NAO FIXADAS ja sairam).
    return NextResponse.json({
      cards,
      offset: offset + cards.length,
      total,
      temMais,
    });
  }

  // ---- MODO QUADRO ----
  const etapas = await prisma.etapa.findMany({
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
  });

  // RESUMO por etapa (Fatia P): total (COUNT) e somaValor (SUM) calculados NO
  // BANCO, com EXATAMENTE o mesmo `where` da listagem — nunca a partir dos cards
  // carregados. A soma replica o valor do card = COALESCE(valorAjustado, valor):
  // dois groupBy particionados por valorAjustado (nulo / nao-nulo) e somados.
  // Sob paginacao isto e o que segura a verdade: 50 na tela, "1.241" no cabecalho.
  const [comPin, paginas, aggAjustado, aggValor] = await Promise.all([
    // Fixadas do quadro inteiro em UMA consulta (nao por coluna): pin e raro.
    prisma.negocio.findMany({
      where: { AND: [where, soFixadas] },
      include: includeCard,
      orderBy: [{ entrouEtapaEm: "desc" }, { id: "desc" }],
      take: TETO_FIXADAS,
    }),
    Promise.all(
      etapas.map((e) =>
        prisma.negocio.findMany({
          where: { AND: [where, { etapaId: e.id }, semFixadas] },
          include: includeCard,
          orderBy: ordemDaEtapa(e.tipo),
          take: limite + 1,
        }),
      ),
    ),
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

  // Fixadas por etapa, mais recentes primeiro (fixadaEm desc, via compararPin).
  const fixadasPorEtapa: Record<string, ReturnType<typeof cardNegocio>[]> = {};
  for (const n of comPin) {
    if (!n.etapaId) continue;
    (fixadasPorEtapa[n.etapaId] ??= []).push(cardNegocio(n));
  }
  for (const id of Object.keys(fixadasPorEtapa)) {
    fixadasPorEtapa[id].sort((a, b) => compararPin(a.fixadaEm, b.fixadaEm));
  }

  // Monta cada coluna: fixadas no topo + o primeiro lote das nao fixadas.
  const colunas: Record<string, ReturnType<typeof cardNegocio>[]> = {};
  const paginacao: Record<
    string,
    { offset: number; temMais: boolean; carregados: number }
  > = {};
  etapas.forEach((e, i) => {
    const linhas = paginas[i];
    const temMais = linhas.length > limite;
    const lote = linhas.slice(0, limite).map(cardNegocio);
    colunas[e.id] = [...(fixadasPorEtapa[e.id] ?? []), ...lote];
    paginacao[e.id] = {
      offset: lote.length,
      temMais,
      carregados: colunas[e.id].length,
    };
  });

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

  return NextResponse.json({ etapas, colunas, resumo, paginacao });
}

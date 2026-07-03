// Lista rica de clientes do usuario logado. Colaborador ve os seus (por dono);
// admin ve todos, podendo filtrar por colaborador (agenteId) ou sem dono.
// Filtros: etiqueta, temperatura, status (ABERTO/GANHO/PERDIDO/PENDENTE), periodo
// (por ultimo contato/criacao). A busca textual e feita no cliente (acentos).
//
// GET /api/clientes?finalidade?&agenteId?(admin)&semDono?(admin)&etiqueta?
//                  &temperatura?&status?&periodo?&inicio?&fim?
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import { normalizarTexto } from "@/lib/format";
import { resolverPeriodo } from "@/lib/metricas";
import {
  Finalidade,
  StatusNeg,
  Temperatura,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);
  const sp = req.nextUrl.searchParams;

  const where: Prisma.LeadWhereInput = {};

  // Escopo por dono.
  if (admin) {
    const agenteId = sp.get("agenteId");
    if (sp.get("semDono") === "1") {
      where.donoId = null;
      where.donoPosVendaId = null;
    } else if (agenteId) {
      where.OR = [{ donoId: agenteId }, { donoPosVendaId: agenteId }];
    }
  } else {
    where.OR = [{ donoId: agente.id }, { donoPosVendaId: agente.id }];
  }

  // Filtros adicionais.
  const etiqueta = sp.get("etiqueta");
  if (etiqueta) where.etiquetas = { some: { etiquetaId: etiqueta } };

  // Empresa faturada.
  const empresa = sp.get("empresa");
  if (empresa) where.empresaFaturadaId = empresa;

  // Produto de interesse (distinto do produto comprado).
  const produtoInteresse = sp.get("produtoInteresse");
  if (produtoInteresse) {
    where.produtosInteresse = { some: { produtoInteresseId: produtoInteresse } };
  }

  // Origem do lead (anuncio / whatsapp / manual / site...).
  const origemF = sp.get("origem");
  if (origemF) where.origem = origemF;

  // Garantia: sim / nao / nao_definido.
  const garantiaF = sp.get("garantia");
  if (garantiaF === "sim") where.garantia = true;
  else if (garantiaF === "nao") where.garantia = false;
  else if (garantiaF === "nao_definido") where.garantia = null;

  // Segmento comercial: VAREJO / ATACADO.
  const segmentoF = sp.get("segmento");
  if (segmentoF === "VAREJO" || segmentoF === "ATACADO") {
    where.segmento = segmentoF;
  }

  // Rastreio: com / sem (por negocio do lead). Usa AND para nao colidir com o
  // filtro de negocios de temperatura/status abaixo.
  const rastreioF = sp.get("rastreio");
  if (rastreioF === "com" || rastreioF === "sem") {
    const cond: Prisma.LeadWhereInput =
      rastreioF === "com"
        ? { negocios: { some: { rastreios: { some: {} } } } }
        : { negocios: { none: { rastreios: { some: {} } } } };
    where.AND = Array.isArray(where.AND)
      ? [...where.AND, cond]
      : where.AND
        ? [where.AND, cond]
        : [cond];
  }

  const temperatura = sp.get("temperatura");
  const status = sp.get("status");
  const negFiltro: Prisma.NegocioWhereInput = {};
  if (
    temperatura === "QUENTE" ||
    temperatura === "MORNO" ||
    temperatura === "FRIO"
  ) {
    negFiltro.temperatura = temperatura as Temperatura;
  }
  if (status === "PENDENTE") negFiltro.pendente = true;
  else if (status === "ABERTO" || status === "GANHO" || status === "PERDIDO") {
    negFiltro.status = status as StatusNeg;
  }
  if (Object.keys(negFiltro).length > 0) {
    where.negocios = { some: negFiltro };
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    take: 500,
    select: {
      id: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      fotoUrl: true,
      donoId: true,
      donoPosVendaId: true,
      criadoEm: true,
      garantia: true,
      segmento: true,
      origem: true,
      anuncioTitulo: true,
      anuncioUrl: true,
      empresaFaturada: { select: { id: true, nome: true } },
      enderecos: {
        select: { uf: true, cidade: true, principal: true },
        orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
      },
      etiquetas: { include: { etiqueta: true } },
      produtosInteresse: {
        select: { produtoInteresse: { select: { id: true, nome: true } } },
      },
      _count: { select: { orcamentos: true } },
      conversas: {
        select: {
          ultimaMensagemEm: true,
          _count: { select: { mensagens: true } },
        },
      },
      negocios: {
        select: {
          id: true,
          status: true,
          temperatura: true,
          pendente: true,
          valor: true,
          finalidade: true,
          criadoEm: true,
        },
      },
    },
  });

  // Periodo (por ultimo contato/criacao). Default 30 dias.
  const preset = sp.get("periodo") ?? "mes";
  const { inicio, fim } = resolverPeriodo(
    preset,
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );

  type Item = {
    leadId: string;
    negocioId: string | null;
    nome: string;
    telefone: string;
    fotoUrl: string | null;
    finalidades: ("VENDA" | "POS_VENDA")[];
    etiquetas: { id: string; nome: string; cor: string }[];
    temperatura: Temperatura | null;
    status: "ABERTO" | "GANHO" | "PERDIDO" | "PENDENTE" | null;
    ultimoContato: Date | null;
    valorAberto: number;
    qtdOrcamentos: number;
    qtdMensagens: number;
    empresaFaturada: string | null;
    garantia: boolean | null;
    segmento: "VAREJO" | "ATACADO" | null;
    uf: string | null;
    cidade: string | null;
    produtosInteresse: { id: string; nome: string }[];
    origem: string | null;
    anuncioTitulo: string | null;
    anuncioUrl: string | null;
  };

  // Filtros de localizacao (endereco principal ou primeiro). cidade = contains.
  const ufFiltro = (sp.get("uf") ?? "").trim().toUpperCase();
  const cidadeFiltro = normalizarTexto(sp.get("cidade") ?? "");

  const clientes: Item[] = [];
  for (const l of leads) {
    // Ultimo contato = maior ultimaMensagemEm das conversas.
    let ultimoContato: Date | null = null;
    let qtdMensagens = 0;
    for (const c of l.conversas) {
      qtdMensagens += c._count.mensagens;
      if (c.ultimaMensagemEm && (!ultimoContato || c.ultimaMensagemEm > ultimoContato)) {
        ultimoContato = c.ultimaMensagemEm;
      }
    }

    // Filtro de periodo: ativo no periodo (ultimo contato) ou criado no periodo.
    const refData = ultimoContato ?? l.criadoEm;
    if (refData < inicio || refData > fim) continue;

    // Localizacao = endereco principal (ou o primeiro). Aplica filtros uf/cidade.
    const endPrincipal = l.enderecos[0] ?? null;
    const uf = endPrincipal?.uf ?? null;
    const cidade = endPrincipal?.cidade ?? null;
    if (ufFiltro && (uf ?? "").toUpperCase() !== ufFiltro) continue;
    if (cidadeFiltro && !normalizarTexto(cidade ?? "").includes(cidadeFiltro)) {
      continue;
    }

    // Negocio "principal" (aberto > pendente > ganho > perdido), por relevancia.
    const abertoPend = l.negocios.find((n) => n.status === "ABERTO" && n.pendente);
    const aberto = l.negocios.find((n) => n.status === "ABERTO");
    const ultimo = [...l.negocios].sort(
      (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
    )[0];
    const principal = aberto ?? abertoPend ?? ultimo ?? null;

    // Status agregado (prioridade pendente > aberto > ganho > perdido).
    let statusAgg: Item["status"] = null;
    if (l.negocios.some((n) => n.pendente)) statusAgg = "PENDENTE";
    else if (l.negocios.some((n) => n.status === "ABERTO")) statusAgg = "ABERTO";
    else if (l.negocios.some((n) => n.status === "GANHO")) statusAgg = "GANHO";
    else if (l.negocios.some((n) => n.status === "PERDIDO")) statusAgg = "PERDIDO";

    const valorAberto = l.negocios
      .filter((n) => n.status === "ABERTO")
      .reduce((s, n) => s + (n.valor != null ? Number(n.valor) : 0), 0);

    const finalidades: ("VENDA" | "POS_VENDA")[] = [];
    if (l.donoId) finalidades.push("VENDA");
    if (l.donoPosVendaId) finalidades.push("POS_VENDA");
    if (finalidades.length === 0) {
      for (const n of l.negocios) {
        if (!finalidades.includes(n.finalidade as "VENDA" | "POS_VENDA")) {
          finalidades.push(n.finalidade as "VENDA" | "POS_VENDA");
        }
      }
    }

    clientes.push({
      leadId: l.id,
      negocioId: principal?.id ?? null,
      nome: nomeEfetivo(l),
      telefone: l.telefone,
      fotoUrl: l.fotoUrl,
      finalidades,
      etiquetas: l.etiquetas.map((le) => ({
        id: le.etiqueta.id,
        nome: le.etiqueta.nome,
        cor: le.etiqueta.cor,
      })),
      temperatura: (principal?.temperatura ?? null) as Temperatura | null,
      status: statusAgg,
      ultimoContato,
      valorAberto,
      qtdOrcamentos: l._count.orcamentos,
      qtdMensagens,
      empresaFaturada: l.empresaFaturada?.nome ?? null,
      garantia: l.garantia,
      segmento: l.segmento,
      uf,
      cidade,
      produtosInteresse: l.produtosInteresse.map((pi) => ({
        id: pi.produtoInteresse.id,
        nome: pi.produtoInteresse.nome,
      })),
      origem: l.origem,
      anuncioTitulo: l.anuncioTitulo,
      anuncioUrl: l.anuncioUrl,
    });
  }

  // Ordena por ultimo contato desc (sem contato vai pro fim).
  clientes.sort((a, b) => {
    const ta = a.ultimoContato ? a.ultimoContato.getTime() : 0;
    const tb = b.ultimoContato ? b.ultimoContato.getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({
    total: clientes.length,
    finalidade: (sp.get("finalidade") as Finalidade) ?? null,
    clientes,
  });
}

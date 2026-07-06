// Aba ORCAMENTOS (Fatia 3.07): lista gerencial dos orcamentos-decisao com
// filtros (decisao, finalidade, periodo por criadoEm, busca por numero/cliente),
// paginacao por cursor e AGREGADOS por decisao calculados no servidor.
// Escopo: admin ve tudo; demais veem so os orcamentos dos seus clientes.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin, escopoLeadWhere } from "@/lib/autorizacao";
import { janelaDeParams } from "@/lib/metricas";
import { formatarNumeroPedido } from "@/lib/format";
import { nomeEfetivo } from "@/lib/cliente";
import { Finalidade } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISOES = new Set(["GANHO", "PENDENTE", "PERDIDO"]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);
  const sp = req.nextUrl.searchParams;

  // Base (escopo): admin -> tudo; demais -> orcamentos de leads que ele possui.
  const base: Prisma.OrcamentoWhereInput = {
    lead: escopoLeadWhere(agente, new URLSearchParams()),
  };

  const finalidadeParam = sp.get("finalidade");
  if (finalidadeParam === Finalidade.VENDA || finalidadeParam === Finalidade.POS_VENDA) {
    base.finalidade = finalidadeParam;
  }
  const janela = janelaDeParams(sp);
  if (janela) base.criadoEm = { gte: janela.inicio, lte: janela.fim };

  // Filtros avancados (Fatia 3.09): UF via endereco do lead; DDD via telefone.
  const leadAnd: Prisma.LeadWhereInput[] = [];
  const uf = sp.get("uf")?.trim().toUpperCase();
  if (uf && /^[A-Z]{2}$/.test(uf)) {
    leadAnd.push({ enderecos: { some: { uf: { equals: uf, mode: "insensitive" } } } });
  }
  const ddd = sp.get("ddd")?.replace(/\D/g, "");
  if (ddd && ddd.length === 2) {
    // Telefone BR normalizado: "55" + DDD + numero -> DDD sao os digitos 3-4.
    leadAnd.push({ telefone: { startsWith: `55${ddd}` } });
  }

  const busca = sp.get("busca")?.trim();
  const andWhere: Prisma.OrcamentoWhereInput[] = [];
  if (busca) {
    const orBusca: Prisma.OrcamentoWhereInput[] = [];
    // Numero: aceita "PED-000042", "000042" ou "42".
    const digitos = busca.replace(/\D/g, "");
    if (digitos) orBusca.push({ numero: Number(digitos) });
    // Nome do cliente (nomeManual/pushName/nome) OU CPF/CNPJ (por digitos).
    orBusca.push({
      lead: {
        OR: [
          { nome: { contains: busca, mode: "insensitive" } },
          { nomeManual: { contains: busca, mode: "insensitive" } },
          { pushName: { contains: busca, mode: "insensitive" } },
          ...(digitos.length >= 3
            ? [{ cpf: { contains: digitos } }, { cnpj: { contains: digitos } }]
            : []),
        ],
      },
    });
    andWhere.push({ OR: orBusca });
  }
  if (leadAnd.length > 0) andWhere.push({ lead: { AND: leadAnd } });
  if (andWhere.length > 0) base.AND = andWhere;

  // where da LISTA (com decisao). Agregados usam base SEM decisao (os 3 cards
  // mostram todas as decisoes dentro dos demais filtros).
  const decisaoParam = sp.get("decisao");
  const where: Prisma.OrcamentoWhereInput =
    decisaoParam && DECISOES.has(decisaoParam)
      ? { ...base, decisao: decisaoParam }
      : base;

  const cursor = sp.get("cursor");
  const TAKE = 50;

  const [linhas, agregados] = await Promise.all([
    prisma.orcamento.findMany({
      where,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      take: TAKE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        numero: true,
        finalidade: true,
        decisao: true,
        total: true,
        totalGarantia: true,
        totalFinal: true,
        agenteId: true,
        criadoEm: true,
        lead: {
          select: { id: true, nome: true, nomeManual: true, pushName: true, telefone: true },
        },
        itens: {
          select: {
            id: true,
            descricao: true,
            quantidade: true,
            valorUnitario: true,
            garantia: true,
          },
        },
      },
    }),
    prisma.orcamento.groupBy({
      by: ["decisao"],
      where: base,
      _count: true,
      _sum: { totalFinal: true },
    }),
  ]);

  const temMais = linhas.length > TAKE;
  const pagina = temMais ? linhas.slice(0, TAKE) : linhas;
  const proximoCursor = temMais ? pagina[pagina.length - 1]?.id ?? null : null;

  // Nomes dos agentes (so admin recebe) em lote.
  let nomeAgente = new Map<string, string | null>();
  if (admin) {
    const ids = [...new Set(pagina.map((o) => o.agenteId).filter(Boolean) as string[])];
    if (ids.length) {
      const ags = await prisma.agente.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true },
      });
      nomeAgente = new Map(ags.map((a) => [a.id, a.nome]));
    }
  }

  const num = (v: unknown) => (v != null ? Number(v) : null);

  // Agregados: garante as 3 chaves (mesmo com 0).
  const resumo: Record<string, { quantidade: number; somaTotal: number }> = {
    GANHO: { quantidade: 0, somaTotal: 0 },
    PENDENTE: { quantidade: 0, somaTotal: 0 },
    PERDIDO: { quantidade: 0, somaTotal: 0 },
  };
  for (const g of agregados) {
    if (resumo[g.decisao]) {
      resumo[g.decisao] = {
        quantidade: g._count,
        somaTotal: num(g._sum.totalFinal) ?? 0,
      };
    }
  }

  return NextResponse.json({
    orcamentos: pagina.map((o) => ({
      id: o.id,
      numero: o.numero,
      numeroFormatado: formatarNumeroPedido(o.numero),
      finalidade: o.finalidade,
      decisao: o.decisao,
      total: num(o.total),
      totalFinal: num(o.totalFinal),
      totalGarantia: num(o.totalGarantia),
      qtdItens: o.itens.length,
      criadoEm: o.criadoEm,
      cliente: { leadId: o.lead.id, nome: nomeEfetivo(o.lead) },
      agente: admin ? { nome: o.agenteId ? nomeAgente.get(o.agenteId) ?? null : null } : undefined,
      itens: o.itens.map((it) => ({
        id: it.id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        valorUnitario: num(it.valorUnitario),
        garantia: it.garantia,
      })),
    })),
    proximoCursor,
    resumo,
  });
}

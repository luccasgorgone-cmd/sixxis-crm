// Despesas de FRETE pagas pela empresa (Fatia 2.76). Lista os pedidos GANHOS
// cujo frete foi pago pela empresa (fretePagoPelaEmpresa=true) — o frete e uma
// DESPESA rastreavel, fora do total cobrado do cliente. Retorna quem/qual pedido,
// valor, data, finalidade e vendedor, alem do TOTAL do periodo.
// Escopo: ADMIN ve tudo (opcionalmente filtrado por agenteId); demais so as
// proprias (negocios de que sao donos).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { nomeEfetivo, selectClienteBasico } from "@/lib/cliente";
import { resolverPeriodo } from "@/lib/metricas";
import { StatusNeg } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const admin = ehAdmin(agente.papel);

  const where: Prisma.NegocioWhereInput = {
    status: StatusNeg.GANHO,
    fretePagoPelaEmpresa: true,
    freteDespesa: { gt: 0 },
  };

  // Escopo: nao-admin so ve as proprias; admin pode filtrar por vendedor.
  if (!admin) {
    where.agenteId = agente.id;
  } else {
    const agenteIdFiltro = sp.get("agenteId")?.trim();
    if (agenteIdFiltro) where.agenteId = agenteIdFiltro;
  }

  // Periodo (sobre a data de fechamento). Sem periodo = tudo.
  const periodo = sp.get("periodo");
  if (periodo) {
    const { inicio, fim } = resolverPeriodo(periodo, null, null, new Date());
    where.fechadoEm = { gte: inicio, lte: fim };
  }

  const negocios = await prisma.negocio.findMany({
    where,
    orderBy: [{ fechadoEm: "desc" }, { atualizadoEm: "desc" }],
    take: 500,
    select: {
      id: true,
      finalidade: true,
      freteDespesa: true,
      fechadoEm: true,
      lead: { select: { ...selectClienteBasico, id: true } },
      agente: { select: { id: true, nome: true } },
    },
  });

  const despesas = negocios.map((n) => ({
    negocioId: n.id,
    leadId: n.lead?.id ?? null,
    cliente: n.lead ? nomeEfetivo(n.lead) : "Cliente",
    valor: n.freteDespesa != null ? Number(n.freteDespesa) : 0,
    data: n.fechadoEm,
    finalidade: n.finalidade,
    vendedor: n.agente?.nome ?? null,
  }));
  const total = despesas.reduce((acc, d) => acc + d.valor, 0);

  return NextResponse.json({ despesas, total, quantidade: despesas.length });
}

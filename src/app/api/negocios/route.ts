// Lista os negocios para o Kanban, agrupados por etapa, filtrados por papel.
// VENDEDOR/POS_VENDA: somente os proprios. ADMIN: todos, com filtro
// meus|todos|sem_dono e agenteId opcional.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { includeCard, cardNegocio } from "@/lib/serializar";
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
  const finalidade =
    fParam === Finalidade.POS_VENDA ? Finalidade.POS_VENDA : Finalidade.VENDA;

  const where: Prisma.NegocioWhereInput = { finalidade };

  // Regra de papel.
  if (!ehAdmin(agente.papel)) {
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

  // Filtros sobre o lead (etiqueta + busca por nome/telefone).
  const leadWhere: Prisma.LeadWhereInput = {};
  if (etiquetaId) {
    leadWhere.etiquetas = { some: { etiquetaId } };
  }
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    leadWhere.OR = [
      { nome: { contains: busca, mode: "insensitive" } },
      ...(digitos ? [{ telefone: { contains: digitos } }] : []),
    ];
  }
  if (Object.keys(leadWhere).length > 0) {
    where.lead = leadWhere;
  }

  const finalidadeEtapas =
    finalidade === Finalidade.VENDA
      ? [FinalidadeEtapa.VENDA, FinalidadeEtapa.AMBAS]
      : [FinalidadeEtapa.POS_VENDA, FinalidadeEtapa.AMBAS];

  const [etapas, negocios] = await Promise.all([
    prisma.etapa.findMany({
      where: { ativo: true, finalidade: { in: finalidadeEtapas } },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true, cor: true, tipo: true, ordem: true },
    }),
    prisma.negocio.findMany({
      where,
      include: includeCard,
      orderBy: { entrouEtapaEm: "desc" },
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

  return NextResponse.json({ etapas, colunas });
}

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

  // Etapas: uniao das finalidades visiveis (+ AMBAS, se houver alguma legada).
  const finalidadeEtapas: FinalidadeEtapa[] = [FinalidadeEtapa.AMBAS];
  if (finalidades.includes(Finalidade.VENDA)) {
    finalidadeEtapas.push(FinalidadeEtapa.VENDA);
  }
  if (finalidades.includes(Finalidade.POS_VENDA)) {
    finalidadeEtapas.push(FinalidadeEtapa.POS_VENDA);
  }

  const [etapas, negocios] = await Promise.all([
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

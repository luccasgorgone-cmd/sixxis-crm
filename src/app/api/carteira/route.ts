// Carteira de um colaborador numa finalidade: contagens por status, total de
// clientes, contagem por etiqueta (so etiquetas da finalidade ou "Ambas") e a
// lista de pendentes. Respeita dono (donoId/donoPosVendaId), finalidade e papel.
//
// GET /api/carteira?finalidade=VENDA|POS_VENDA[&agenteId=...(admin)]
//   - Colaborador: sempre a propria carteira (agenteId ignorado), so finalidade
//     a que tem acesso.
//   - Admin: pode escolher o colaborador e a finalidade.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { campoDono, temAcesso } from "@/lib/dono";
import { nomeEfetivo } from "@/lib/cliente";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);

  // Finalidade (obrigatoria).
  const f = req.nextUrl.searchParams.get("finalidade");
  if (f !== Finalidade.VENDA && f !== Finalidade.POS_VENDA) {
    return NextResponse.json({ erro: "finalidade invalida" }, { status: 400 });
  }
  const finalidade = f;

  // Colaborador alvo: admin pode escolher; demais so veem a propria carteira.
  const paramAgente = req.nextUrl.searchParams.get("agenteId");
  const alvoId = admin && paramAgente ? paramAgente : agente.id;

  const alvo = await prisma.agente.findUnique({
    where: { id: alvoId },
    select: { id: true, nome: true, acessoVenda: true, acessoPosVenda: true },
  });
  if (!alvo) {
    return NextResponse.json({ erro: "colaborador nao encontrado" }, { status: 404 });
  }
  if (!temAcesso(alvo, finalidade)) {
    return NextResponse.json(
      { erro: "colaborador sem acesso a essa finalidade" },
      { status: 422 },
    );
  }

  const campo = campoDono(finalidade);

  // Negocios da carteira (finalidade + dono do lead). Inclui dados do cliente e
  // etiquetas para montar os itens de drilldown.
  const [negocios, totalClientes, etiquetasValidas] = await Promise.all([
    prisma.negocio.findMany({
      where: { finalidade, lead: { [campo]: alvoId } },
      orderBy: { atualizadoEm: "desc" },
      select: {
        id: true,
        status: true,
        valor: true,
        pendente: true,
        motivoPendencia: true,
        lead: {
          select: {
            id: true,
            nome: true,
            pushName: true,
            nomeManual: true,
            telefone: true,
            fotoUrl: true,
            etiquetas: { include: { etiqueta: true } },
          },
        },
      },
    }),
    prisma.lead.count({ where: { [campo]: alvoId } }),
    // Etiquetas que valem para a finalidade (dela ou "Ambas" = null).
    prisma.etiqueta.findMany({
      where: { OR: [{ finalidade }, { finalidade: null }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cor: true },
    }),
  ]);

  // Serializa cada negocio num item da carteira (Decimal -> number).
  const itens = negocios.map((n) => ({
    negocioId: n.id,
    leadId: n.lead.id,
    nomeEfetivo: nomeEfetivo(n.lead),
    telefone: n.lead.telefone,
    fotoUrl: n.lead.fotoUrl,
    valor: n.valor != null ? Number(n.valor) : null,
    status: n.status,
    pendente: n.pendente,
    motivoPendencia: n.motivoPendencia,
    etiquetas: n.lead.etiquetas.map((le) => ({
      id: le.etiqueta.id,
      nome: le.etiqueta.nome,
      cor: le.etiqueta.cor,
    })),
  }));

  // Contagens por status (por negocio) + pendentes.
  const resumo = {
    aberto: itens.filter((i) => i.status === "ABERTO").length,
    ganho: itens.filter((i) => i.status === "GANHO").length,
    perdido: itens.filter((i) => i.status === "PERDIDO").length,
    pendente: itens.filter((i) => i.pendente).length,
    totalClientes,
  };

  // Contagem por etiqueta: clientes DISTINTOS com a etiqueta, apenas para as
  // etiquetas validas da finalidade.
  const validas = new Map(etiquetasValidas.map((e) => [e.id, e]));
  const leadsPorEtiqueta = new Map<string, Set<string>>();
  for (const i of itens) {
    for (const et of i.etiquetas) {
      if (!validas.has(et.id)) continue;
      const set = leadsPorEtiqueta.get(et.id) ?? new Set<string>();
      set.add(i.leadId);
      leadsPorEtiqueta.set(et.id, set);
    }
  }
  const etiquetas = etiquetasValidas
    .map((e) => ({
      id: e.id,
      nome: e.nome,
      cor: e.cor,
      count: leadsPorEtiqueta.get(e.id)?.size ?? 0,
    }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  // Lista de pendentes (cliente + motivo + link para o negocio).
  const pendentes = itens.filter((i) => i.pendente);

  return NextResponse.json({
    finalidade,
    agente: { id: alvo.id, nome: alvo.nome },
    resumo,
    etiquetas,
    itens,
    pendentes,
  });
}

// Historico COMPLETO do cliente, em ordem cronologica (desc). Combina:
//  - Contatos (conversas: data, canal/instancia, finalidade) + primeiro contato
//  - Atividades (timeline: atribuicao, transferencia, notas, etiquetas, etapas)
//  - Compras (negocios GANHOS: itens/produtos e valor) — "o que comprou"
//  - Pedidos da loja (ponte /api/loja, best-effort; offline nao quebra)
// Dono ou ADMIN.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { buscarCliente } from "@/lib/loja";
import { StatusNeg } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Evento = {
  id: string;
  categoria: "contato" | "atividade" | "compra" | "pedido";
  tipo: string;
  titulo: string;
  descricao: string | null;
  data: string;
  agente?: string | null;
  finalidade?: string | null;
  valor?: number | null;
  itens?: string[];
  status?: string | null;
};

function produtosParaLista(p: unknown): string[] {
  if (!Array.isArray(p)) return [];
  return p
    .map((x) =>
      typeof x === "string"
        ? x
        : x && typeof x === "object" && "nome" in x
          ? String((x as { nome: unknown }).nome)
          : null,
    )
    .filter((x): x is string => !!x);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      telefone: true,
      origem: true,
      donoId: true,
      donoPosVendaId: true,
      conversas: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true,
          criadoEm: true,
          finalidade: true,
          instancia: true,
          agenteId: true,
          instanciaRef: { select: { nome: true } },
        },
      },
    },
  });
  if (!lead) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  const ehDono =
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id ||
    lead.conversas.some((c) => c.agenteId === agente.id);
  if (!ehAdmin(agente.papel) && !ehDono) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const [atividades, ganhos] = await Promise.all([
    prisma.atividade.findMany({
      where: { leadId: id },
      orderBy: { criadoEm: "desc" },
      include: { agente: { select: { nome: true } } },
      take: 300,
    }),
    prisma.negocio.findMany({
      where: { leadId: id, status: StatusNeg.GANHO },
      orderBy: { fechadoEm: "desc" },
      select: {
        id: true,
        valor: true,
        produtos: true,
        finalidade: true,
        fechadoEm: true,
        criadoEm: true,
        agente: { select: { nome: true } },
      },
    }),
  ]);

  const eventos: Evento[] = [];

  // ---- Contatos (uma entrada por conversa; a 1a marca o primeiro contato) ----
  lead.conversas.forEach((c, i) => {
    eventos.push({
      id: `contato-${c.id}`,
      categoria: "contato",
      tipo: "CONTATO",
      titulo: i === 0 ? "Primeiro contato" : "Novo contato",
      descricao: c.instanciaRef?.nome ?? c.instancia,
      data: c.criadoEm.toISOString(),
      finalidade: c.finalidade,
    });
  });

  // ---- Compras (negocios ganhos) ----
  for (const g of ganhos) {
    const itens = produtosParaLista(g.produtos);
    eventos.push({
      id: `compra-${g.id}`,
      categoria: "compra",
      tipo: "COMPRA",
      titulo: "Compra realizada",
      descricao: itens.length ? itens.join(", ") : "Negocio ganho",
      data: (g.fechadoEm ?? g.criadoEm).toISOString(),
      valor: g.valor != null ? Number(g.valor) : null,
      itens,
      finalidade: g.finalidade,
      agente: g.agente?.nome ?? null,
    });
  }

  // ---- Atividades (exceto GANHO, ja coberto por "compra") ----
  for (const a of atividades) {
    if (a.tipo === "GANHO") continue;
    eventos.push({
      id: `ativ-${a.id}`,
      categoria: "atividade",
      tipo: a.tipo,
      titulo: a.descricao,
      descricao: null,
      data: a.criadoEm.toISOString(),
      agente: a.agente?.nome ?? null,
    });
  }

  // ---- Pedidos da loja (best-effort) ----
  let lojaOffline = false;
  try {
    const loja = await buscarCliente(lead.telefone);
    for (const p of loja.pedidos ?? []) {
      eventos.push({
        id: `pedido-${p.id}`,
        categoria: "pedido",
        tipo: "PEDIDO",
        titulo: `Pedido ${p.numero}`,
        descricao: p.itens?.length
          ? p.itens.map((it) => `${it.qtd}x ${it.nome}`).join(", ")
          : null,
        data: p.criadoEm,
        valor: p.total,
        itens: p.itens?.map((it) => `${it.qtd}x ${it.nome}`) ?? [],
        status: p.status,
      });
    }
  } catch {
    lojaOffline = true;
  }

  eventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return NextResponse.json({ eventos, lojaOffline });
}

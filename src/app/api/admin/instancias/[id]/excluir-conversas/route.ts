// Exclusao FISICA do atendimento dos clientes de um NUMERO (instancia). SOMENTE
// ADMIN (gate no servidor). Escopo: leads que tem Conversa cujo instanciaId = id.
// Remove o atendimento por completo desses clientes (Conversa/Mensagem, Negocios
// e dependentes, e o Lead). GET = preview (contagem). POST = executa.
// NAO toca na configuracao.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import { excluirLeadsCompleto } from "@/lib/exclusao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Leads no escopo do numero (que tem ao menos uma conversa nessa instancia).
async function leadsDoNumero(instanciaId: string): Promise<string[]> {
  const convs = await prisma.conversa.findMany({
    where: { instanciaId },
    select: { leadId: true },
  });
  return Array.from(new Set(convs.map((c) => c.leadId)));
}

// Preview: contagem de clientes, conversas e mensagens que seriam afetados.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const instancia = await prisma.instanciaWhatsApp.findUnique({
    where: { id },
    select: { id: true, nome: true, numero: true },
  });
  if (!instancia) {
    return NextResponse.json({ erro: "numero nao encontrado" }, { status: 404 });
  }
  const leadIds = await leadsDoNumero(id);
  const [conversas, mensagens, negocios] = await Promise.all([
    prisma.conversa.count({ where: { leadId: { in: leadIds } } }),
    prisma.mensagem.count({ where: { conversa: { leadId: { in: leadIds } } } }),
    prisma.negocio.count({ where: { leadId: { in: leadIds } } }),
  ]);
  return NextResponse.json({
    instancia,
    clientes: leadIds.length,
    conversas,
    mensagens,
    negocios,
  });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const instancia = await prisma.instanciaWhatsApp.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!instancia) {
    return NextResponse.json({ erro: "numero nao encontrado" }, { status: 404 });
  }

  const leadIds = await leadsDoNumero(id);
  const resumo = await excluirLeadsCompleto(leadIds);

  getIO()?.emit("conversa:excluida", { instanciaId: id });
  getIO()?.emit("negocio:atualizado", {
    negocioId: null,
    etapaId: null,
    motivo: "excluido",
  });

  return NextResponse.json({
    ok: true,
    clientesApagados: resumo.leads,
    conversasApagadas: resumo.conversas,
    mensagensApagadas: resumo.mensagens,
    negociosApagados: resumo.negocios,
  });
}

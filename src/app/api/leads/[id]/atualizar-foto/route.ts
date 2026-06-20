// Forca o refresh da foto de perfil do WhatsApp do cliente. Dono ou ADMIN.
// Usa a instancia da conversa mais recente do lead. Loja/Evolution offline ->
// nao quebra: retorna fotoUrl null sem erro.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { fetchFotoPerfil } from "@/lib/evolution";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
      donoId: true,
      donoPosVendaId: true,
      conversas: {
        orderBy: { ultimaMensagemEm: "desc" },
        select: { agenteId: true, instancia: true },
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

  const instancia =
    lead.conversas[0]?.instancia ??
    process.env.EVOLUTION_INSTANCE ??
    "sixxis-wa1";
  const url = await fetchFotoPerfil(instancia, lead.telefone);

  const atualizado = await prisma.lead.update({
    where: { id },
    data: { fotoAtualizadaEm: new Date(), ...(url ? { fotoUrl: url } : {}) },
    select: { fotoUrl: true },
  });

  if (url) {
    getIO()?.emit("cliente:atualizado", { leadId: id, fotoUrl: url });
  }

  return NextResponse.json({ fotoUrl: atualizado.fotoUrl, encontrada: !!url });
}

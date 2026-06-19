// Proxy do CRM para o historico do cliente na loja, por telefone. A chave
// interna fica no servidor. Restrito ao dono da conversa/lead ou ADMIN.
// Loja offline -> erro amigavel (nao quebra o CRM).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { buscarCliente } from "@/lib/loja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const telefone = req.nextUrl.searchParams.get("telefone")?.trim() ?? "";
  if (!telefone) {
    return NextResponse.json({ erro: "telefone obrigatorio" }, { status: 400 });
  }

  // Ownership: nao-admin so consulta o cliente de um lead que e dele.
  if (!ehAdmin(agente.papel)) {
    const digitos = telefone.replace(/\D/g, "");
    const lead = await prisma.lead.findFirst({
      where: { OR: [{ telefone }, { telefone: digitos }] },
      select: {
        donoId: true,
        donoPosVendaId: true,
        conversas: { select: { agenteId: true } },
      },
    });
    const ehDono =
      !!lead &&
      (lead.donoId === agente.id ||
        lead.donoPosVendaId === agente.id ||
        lead.conversas.some((c) => c.agenteId === agente.id));
    if (!ehDono) {
      return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
    }
  }

  try {
    const dados = await buscarCliente(telefone);
    return NextResponse.json({ ...dados, offline: false });
  } catch {
    return NextResponse.json(
      { cliente: null, pedidos: [], carrinho: null, offline: true },
      { status: 200 },
    );
  }
}

// POST: ativa um contato da carteira (o vendedor abre a conversa). Cria/reusa o
// Lead por telefone, cria a conversa no numero escolhido e o negocio (via
// garantirNegocioParaLead — dedup-safe), liga o contato e devolve o leadId para
// a UI abrir /inbox?lead=<id>. Escopo: vendedor so ativa contato DELE; admin
// qualquer um. Nao dispara mensagem — quem manda a 1a msg e o vendedor, no Inbox.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { ativarContato } from "@/lib/carteira/ativar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { contatoId?: string; instanciaId?: string | null }
    | null;
  const contatoId = body?.contatoId?.trim();
  if (!contatoId) return NextResponse.json({ erro: "contatoId obrigatorio" }, { status: 400 });

  const contato = await prisma.carteiraContato.findUnique({
    where: { id: contatoId },
    select: { id: true, donoId: true },
  });
  if (!contato) return NextResponse.json({ erro: "contato nao encontrado" }, { status: 404 });
  // Vendedor so ativa o que e dele.
  if (!ehAdmin(agente.papel) && contato.donoId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao sobre este contato" }, { status: 403 });
  }

  try {
    const r = await ativarContato(contatoId, agente.id, { instanciaId: body?.instanciaId ?? null });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "falha ao ativar" },
      { status: 500 },
    );
  }
}

// Lista as conversas para a inbox. Filtra por papel (nao-admin ve so as suas,
// por agenteId espelhado do dono) e por finalidade (?finalidade=VENDA|POS_VENDA).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { previewMensagem } from "@/lib/preview";
import type { Prisma } from "@/generated/prisma/client";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const where: Prisma.ConversaWhereInput = { arquivada: false };

  // Papel: nao-admin so as conversas atribuidas a ele.
  if (!ehAdmin(agente.papel)) {
    where.agenteId = agente.id;
  }

  // Finalidade opcional.
  const f = req.nextUrl.searchParams.get("finalidade");
  if (f === Finalidade.VENDA || f === Finalidade.POS_VENDA) {
    where.finalidade = f;
  }

  const conversas = await prisma.conversa.findMany({
    where,
    orderBy: [{ ultimaMensagemEm: "desc" }, { criadoEm: "desc" }],
    include: {
      lead: { select: { nome: true, telefone: true } },
      instanciaRef: { select: { nome: true, numero: true } },
      mensagens: {
        orderBy: { hora: "desc" },
        take: 1,
        select: { conteudo: true, tipo: true },
      },
    },
    take: 200,
  });

  const lista = conversas.map((c) => {
    const ultima = c.mensagens[0];
    return {
      id: c.id,
      leadNome: c.lead.nome,
      leadTelefone: c.lead.telefone,
      ultimaMensagemPreview: ultima
        ? previewMensagem(ultima.tipo, ultima.conteudo)
        : null,
      ultimaMensagemEm: c.ultimaMensagemEm,
      naoLidas: c.naoLidas,
      atendidoPor: c.atendidoPor,
      agenteId: c.agenteId,
      finalidade: c.finalidade,
      instanciaNome: c.instanciaRef?.nome ?? c.instancia,
      instanciaNumero: c.instanciaRef?.numero ?? null,
    };
  });

  return NextResponse.json({ conversas: lista });
}

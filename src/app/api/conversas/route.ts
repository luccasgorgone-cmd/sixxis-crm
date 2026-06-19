// Lista as conversas para a inbox, ordenadas pela ultima atividade.
// Protegida por sessao (alem do middleware, validamos aqui tambem).
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { previewMensagem } from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const conversas = await prisma.conversa.findMany({
    where: { arquivada: false },
    orderBy: [{ ultimaMensagemEm: "desc" }, { criadoEm: "desc" }],
    include: {
      lead: { select: { nome: true, telefone: true } },
      // Ultima mensagem para a previa na lista.
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
    };
  });

  return NextResponse.json({ conversas: lista });
}

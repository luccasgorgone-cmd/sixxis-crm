// Lista os grupos internos (nao arquivados) com previa da ultima mensagem e a
// contagem de mensagens. Comunicacao interna: visivel a QUALQUER agente logado
// (grupos nao tem dono de lead). ISOLADO — nao toca Lead/Conversa/metricas.
import { NextResponse } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const grupos = await prisma.grupoInterno.findMany({
    where: { arquivado: false },
    orderBy: [{ ultimaMensagemEm: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true,
      jid: true,
      nome: true,
      fotoUrl: true,
      instancia: true,
      ultimaMensagemEm: true,
      _count: { select: { mensagens: true } },
      mensagens: {
        orderBy: { hora: "desc" },
        take: 1,
        select: { conteudo: true, tipo: true, autorNome: true, direcao: true, hora: true },
      },
    },
  });

  const lista = grupos.map((g) => ({
    id: g.id,
    jid: g.jid,
    nome: g.nome,
    fotoUrl: g.fotoUrl,
    instancia: g.instancia,
    ultimaMensagemEm: g.ultimaMensagemEm,
    totalMensagens: g._count.mensagens,
    ultimaMensagem: g.mensagens[0] ?? null,
  }));

  return NextResponse.json({ grupos: lista });
}

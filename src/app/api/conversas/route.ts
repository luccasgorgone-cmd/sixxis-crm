// Lista as conversas para a inbox. Filtra por papel (nao-admin ve so as suas,
// por agenteId espelhado do dono) e por finalidade (?finalidade=VENDA|POS_VENDA).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { previewMensagem } from "@/lib/preview";
import { nomeEfetivo, selectClienteBasico } from "@/lib/cliente";
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
      lead: {
        select: {
          ...selectClienteBasico,
          // Negocios do lead (leves) p/ associar o negocio da finalidade da
          // conversa — usado pelo painel completo do Inbox (acompanhamento/notas).
          negocios: {
            select: {
              id: true,
              finalidade: true,
              status: true,
              criadoEm: true,
            },
          },
        },
      },
      instanciaRef: { select: { nome: true, numero: true } },
      mensagens: {
        orderBy: { hora: "desc" },
        take: 1,
        select: { conteudo: true, tipo: true, apagada: true, apagadaPor: true },
      },
    },
    take: 200,
  });

  // Negocio associado a conversa: mesmo lead + mesma finalidade. Prefere o ABERTO;
  // senao o mais recente por criacao. null quando o lead nao tem negocio da
  // finalidade (o painel do Inbox omite os blocos de nivel negocio graciosamente).
  function negocioDaConversa(
    negocios: {
      id: string;
      finalidade: Finalidade;
      status: string;
      criadoEm: Date;
    }[],
    finalidade: Finalidade,
  ): string | null {
    const daFinalidade = negocios.filter((n) => n.finalidade === finalidade);
    if (daFinalidade.length === 0) return null;
    const aberto = daFinalidade.find((n) => n.status === "ABERTO");
    if (aberto) return aberto.id;
    return [...daFinalidade].sort(
      (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
    )[0].id;
  }

  const admin = ehAdmin(agente.papel);
  const lista = conversas.map((c) => ({
    id: c.id,
    leadId: c.leadId,
    negocioId: negocioDaConversa(c.lead.negocios, c.finalidade),
    leadNome: nomeEfetivo(c.lead),
    leadFoto: c.lead.fotoUrl,
    leadTelefone: c.lead.telefone,
    ultimaMensagemPreview: c.mensagens[0]
      ? c.mensagens[0].apagada
        ? c.mensagens[0].apagadaPor === "CLIENTE"
          ? "Mensagem apagada pelo cliente"
          : "Mensagem apagada"
        : previewMensagem(c.mensagens[0].tipo, c.mensagens[0].conteudo)
      : null,
    ultimaMensagemEm: c.ultimaMensagemEm,
    naoLidas: c.naoLidas,
    atendidoPor: c.atendidoPor,
    agenteId: c.agenteId,
    // Finalidade visivel a todos (indicador colorido). Nome/numero da instancia
    // segue apenas para ADMIN.
    finalidade: c.finalidade,
    // Numero padrao de resposta (ultima entrada do cliente naquele setor).
    instanciaId: c.instanciaId,
    ...(admin
      ? {
          instanciaNome: c.instanciaRef?.nome ?? c.instancia,
          instanciaNumero: c.instanciaRef?.numero ?? null,
        }
      : {}),
  }));

  return NextResponse.json({ conversas: lista });
}

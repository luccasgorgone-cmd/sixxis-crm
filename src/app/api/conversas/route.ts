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

  // Busca por CONTEUDO das mensagens (case-insensitive). Combina com o escopo
  // acima (AND implicito) — nao acha conversas fora do que o usuario ve.
  const texto = req.nextUrl.searchParams.get("texto")?.trim();
  if (texto) {
    where.mensagens = {
      some: { conteudo: { contains: texto, mode: "insensitive" } },
    };
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

  // Trecho que bateu na busca: 1 consulta extra (nao N+1) so para as conversas
  // ja filtradas. Pega a mensagem correspondente mais recente por conversa.
  const trechos = new Map<string, string>();
  if (texto && conversas.length > 0) {
    const casadas = await prisma.mensagem.findMany({
      where: {
        conversaId: { in: conversas.map((c) => c.id) },
        conteudo: { contains: texto, mode: "insensitive" },
      },
      orderBy: { hora: "desc" },
      select: { conversaId: true, conteudo: true },
      take: 400,
    });
    for (const m of casadas) {
      if (m.conteudo && !trechos.has(m.conversaId)) {
        trechos.set(m.conversaId, m.conteudo);
      }
    }
  }

  const admin = ehAdmin(agente.papel);
  const lista = conversas.map((c) => ({
    id: c.id,
    leadId: c.leadId,
    ...(texto ? { trechoBusca: trechos.get(c.id) ?? null } : {}),
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

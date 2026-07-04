// Adiciona uma nota ao lead do negocio e registra na linha do tempo.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";
import { TipoHistorico, AtividadeTipo, Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { texto?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const texto = String(body?.texto ?? "").trim();
  if (!texto) {
    return NextResponse.json({ erro: "texto obrigatorio" }, { status: 400 });
  }

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      leadId: true,
      agenteId: true,
      finalidade: true,
      lead: { select: { donoId: true, donoPosVendaId: true } },
    },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  // Admin / dono do negocio / dono do cliente na finalidade (negocio pode nao ter
  // agenteId quando criado ao abrir a conversa/cadastro manual). Fatia 2.86.
  const ehDonoCliente =
    negocio.finalidade === Finalidade.VENDA
      ? negocio.lead.donoId === agente.id
      : negocio.lead.donoPosVendaId === agente.id;
  if (!podeAcessarNegocio(agente, negocio.agenteId) && !ehDonoCliente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const resumo = texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
  const [nota] = await prisma.$transaction([
    prisma.nota.create({
      data: { leadId: negocio.leadId, agenteId: agente.id, texto },
    }),
    prisma.historicoNegocio.create({
      data: {
        negocioId: negocio.id,
        agenteId: agente.id,
        tipo: TipoHistorico.NOTA,
        descricao: resumo,
      },
    }),
    prisma.atividade.create({
      data: {
        leadId: negocio.leadId,
        negocioId: negocio.id,
        agenteId: agente.id,
        tipo: AtividadeTipo.NOTA,
        descricao: resumo,
      },
    }),
  ]);

  return NextResponse.json({
    nota: {
      id: nota.id,
      texto: nota.texto,
      agente: agente.nome,
      criadoEm: nota.criadoEm,
    },
  });
}

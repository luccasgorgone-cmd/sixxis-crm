// Lista os alertas de SLA ABERTOS (negocios parados alem do tempo da etapa) do
// agente conectado — admin ve os de todos. Alimenta o dropdown do sino de SLA
// com O QUE ESTA EM ATRASO (cliente, etapa, ha quanto tempo), cada item clicavel
// para abrir a conversa. READ-ONLY: nao cria/fecha alerta nem envia nada.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { AlertaNivel } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);

  const alertas = await prisma.alertaNegocio.findMany({
    where: {
      resolvidoEm: null,
      // So o que esta EM ATRASO (VERMELHO); AMARELO e aviso visual no card.
      nivel: AlertaNivel.VERMELHO,
      // Mesma regra do contador: dono ve os seus, admin ve todos.
      negocio: admin ? {} : { agenteId: agente.id },
    },
    orderBy: { criadoEm: "asc" }, // mais antigo primeiro = o mais atrasado no topo
    take: 50,
    select: {
      id: true,
      criadoEm: true,
      negocio: {
        select: {
          id: true,
          finalidade: true,
          entrouEtapaEm: true,
          etapa: { select: { nome: true } },
          agente: { select: { nome: true } },
          lead: {
            select: {
              id: true,
              nomeManual: true,
              pushName: true,
              nome: true,
              telefone: true,
            },
          },
        },
      },
    },
  });

  const itens = alertas.map((a) => {
    const l = a.negocio.lead;
    const cliente = l.nomeManual || l.pushName || l.nome || l.telefone;
    return {
      alertaId: a.id,
      negocioId: a.negocio.id,
      leadId: l.id,
      cliente,
      finalidade: a.negocio.finalidade,
      etapa: a.negocio.etapa?.nome ?? "etapa",
      entrouEtapaEm: a.negocio.entrouEtapaEm,
      // So interessa ao admin saber de quem e o card.
      dono: admin ? (a.negocio.agente?.nome ?? null) : null,
    };
  });

  return NextResponse.json({ total: itens.length, itens });
}

// Inicia/garante a conversa de um lead (para abrir no Inbox a partir da ficha ou
// da lista de clientes). Idempotente: se ja existe, devolve a existente. Reusa
// garantirConversaUnificada (mesmo helper da ingestao) — NAO dispara nada. Escopo:
// o usuario so inicia com leads que pode ver (escopoLeadWhere).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin, escopoLeadWhere } from "@/lib/autorizacao";
import { garantirConversaUnificada } from "@/lib/conversa";
import { campoDono } from "@/lib/dono";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finalidadeValida(v: unknown): Finalidade | null {
  return v === Finalidade.VENDA || v === Finalidade.POS_VENDA ? v : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  let body: { leadId?: string; finalidade?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const leadId = String(body.leadId ?? "");
  if (!leadId) {
    return NextResponse.json({ erro: "leadId obrigatorio" }, { status: 400 });
  }

  // ESCOPO: so encontra o lead se o usuario pode ve-lo (nao-admin: sua carteira).
  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id: leadId }, escopoLeadWhere(agente, new URLSearchParams())] },
    select: {
      id: true,
      donoId: true,
      donoPosVendaId: true,
      negocios: { select: { finalidade: true }, take: 5 },
    },
  });
  if (!lead) {
    return NextResponse.json(
      { erro: "cliente nao encontrado no seu escopo" },
      { status: 404 },
    );
  }

  const admin = ehAdmin(agente.papel);
  const pedida = finalidadeValida(body.finalidade);
  let finalidade: Finalidade;
  if (admin) {
    finalidade =
      pedida ??
      lead.negocios[0]?.finalidade ??
      Finalidade.VENDA;
  } else {
    // Nao-admin: so a finalidade que ELE possui (evita criar conversa no inbox
    // de outro). Respeita a pedida quando ele e o dono dela.
    const ehVenda = lead.donoId === agente.id;
    const ehPos = lead.donoPosVendaId === agente.id;
    if (pedida === Finalidade.POS_VENDA && ehPos) finalidade = Finalidade.POS_VENDA;
    else if (pedida === Finalidade.VENDA && ehVenda) finalidade = Finalidade.VENDA;
    else finalidade = ehVenda ? Finalidade.VENDA : Finalidade.POS_VENDA;
  }

  // Ja existia? (para o cliente saber se abriu ou iniciou).
  const antes = await prisma.conversa.findFirst({
    where: { leadId, finalidade },
    select: { id: true },
  });

  const conversa = await garantirConversaUnificada(leadId, finalidade);

  // Se a conversa nao tem dono ainda, atribui ao dono da finalidade (assim cai no
  // inbox certo e respeita o escopo). Nao sobrescreve um dono ja definido.
  const donoFinalidade = lead[campoDono(finalidade)];
  if (!conversa.agenteId && donoFinalidade) {
    await prisma.conversa.update({
      where: { id: conversa.id },
      data: { agenteId: donoFinalidade },
    });
  }

  return NextResponse.json({
    conversaId: conversa.id,
    finalidade,
    criada: !antes,
  });
}

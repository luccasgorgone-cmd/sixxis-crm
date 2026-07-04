// Transferencia de clientes EM MASSA para um agente, numa finalidade. SOMENTE
// ADMIN (cruza equipes) — gate no servidor. Reusa a mesma logica da transferencia
// individual: reatribui dono da finalidade, o negocio aberto, espelha nas
// conversas e registra Atividade(TRANSFERENCIA). Retorna transferidos/ignorados.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import { campoDono, temAcesso, espelharDonoNasConversas } from "@/lib/dono";
import {
  StatusNeg,
  Finalidade,
  AtividadeTipo,
  TipoHistorico,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  let body: { leadIds?: unknown; agenteId?: string; finalidade?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const leadIds = Array.isArray(body.leadIds)
    ? Array.from(new Set(body.leadIds.filter((x): x is string => typeof x === "string")))
    : [];
  const destinoId = String(body.agenteId ?? "");
  const finalidade =
    body.finalidade === Finalidade.POS_VENDA
      ? Finalidade.POS_VENDA
      : body.finalidade === Finalidade.VENDA
        ? Finalidade.VENDA
        : null;

  if (leadIds.length === 0 || !destinoId || !finalidade) {
    return NextResponse.json(
      { erro: "leadIds, agenteId e finalidade sao obrigatorios" },
      { status: 400 },
    );
  }

  // AUTORIZACAO (Fatia 2.84): liberada aos USUARIOS com escopo rigido. O executor
  // precisa ter ACESSO a finalidade da transferencia (admin sempre). Alem disso,
  // cada lead e validado no loop: nao-admin so transfere os PROPRIOS (dono da
  // finalidade em questao); leads de outros agentes sao IGNORADOS (nao vazam).
  if (!ehAdmin(agente.papel) && !temAcesso(agente, finalidade)) {
    return NextResponse.json(
      { erro: "voce nao tem acesso a essa finalidade" },
      { status: 403 },
    );
  }

  const destino = await prisma.agente.findUnique({
    where: { id: destinoId },
    select: { id: true, nome: true, ativo: true, acessoVenda: true, acessoPosVenda: true },
  });
  if (!destino || !destino.ativo) {
    return NextResponse.json({ erro: "agente destino invalido" }, { status: 400 });
  }
  if (!temAcesso(destino, finalidade)) {
    return NextResponse.json(
      { erro: "destino sem acesso a essa finalidade" },
      { status: 403 },
    );
  }

  const campo = campoDono(finalidade);
  let transferidos = 0;
  let ignorados = 0;
  const finalidadesAfetadas = new Set<Finalidade>();

  for (const id of leadIds) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        donoId: true,
        donoPosVendaId: true,
        dono: { select: { nome: true } },
        donoPosVenda: { select: { nome: true } },
      },
    });
    if (!lead) {
      ignorados++;
      continue;
    }
    // ESCOPO: nao-admin so transfere leads que POSSUI na finalidade em questao
    // (dono da finalidade = ele). Leads de outros agentes sao ignorados.
    if (!ehAdmin(agente.papel) && lead[campo] !== agente.id) {
      ignorados++;
      continue;
    }
    // Ja e do destino nessa finalidade: nada a fazer.
    if (lead[campo] === destino.id) {
      ignorados++;
      continue;
    }

    const negocio = await prisma.negocio.findFirst({
      where: { leadId: id, finalidade, status: StatusNeg.ABERTO },
      orderBy: { criadoEm: "desc" },
      select: { id: true },
    });
    const de =
      (finalidade === Finalidade.VENDA
        ? lead.dono?.nome
        : lead.donoPosVenda?.nome) ?? "sem dono";
    const descricao = `Transferido de ${de} para ${destino.nome}`;

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data:
          finalidade === Finalidade.VENDA
            ? { donoId: destino.id }
            : { donoPosVendaId: destino.id },
      });
      if (negocio) {
        await tx.negocio.update({
          where: { id: negocio.id },
          data: { agenteId: destino.id },
        });
        await tx.historicoNegocio.create({
          data: {
            negocioId: negocio.id,
            agenteId: agente.id,
            tipo: TipoHistorico.ATRIBUICAO,
            descricao,
          },
        });
      }
      await espelharDonoNasConversas(tx, id, finalidade, destino.id);
      await tx.atividade.create({
        data: {
          leadId: id,
          negocioId: negocio?.id ?? null,
          agenteId: agente.id,
          tipo: AtividadeTipo.TRANSFERENCIA,
          descricao,
        },
      });
    });
    transferidos++;
    finalidadesAfetadas.add(finalidade);
  }

  // Atualiza kanban/carteira/clientes/inbox.
  if (transferidos > 0) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: null,
      etapaId: null,
      motivo: "transferido",
    });
    for (const f of finalidadesAfetadas) {
      getIO()?.emit("conversa:atualizada", { leadId: null, finalidade: f });
    }
  }

  return NextResponse.json({ ok: true, transferidos, ignorados });
}

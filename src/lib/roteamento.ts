// Engine de roteamento de leads POR FINALIDADE. Decide o dono do negocio aberto
// daquela finalidade (VENDA usa a equipe VENDEDOR + Lead.donoId + ponteiro de
// venda; POS_VENDA usa POS_VENDA + Lead.donoPosVendaId + ponteiro de pos-venda):
//   1. Sticky: respeitarDono + lead ja tem dono da finalidade -> cai no dono.
//   2. Round-robin: proximo da equipe por ordem de chegada, ciclo, avanca ponteiro.
//   3. Roteamento off / equipe vazia -> fica sem dono.
// Tudo em UMA transacao (evita corrida no ponteiro). Espelha o dono nas conversas.
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { StatusNeg, AtividadeTipo, TipoHistorico, Finalidade } from "../generated/prisma/enums";
import { campoDono, campoPonteiro, filtroEquipe, espelharDonoNasConversas } from "./dono";

export async function rotearLeadNovo(
  leadId: string,
  finalidade: Finalidade = Finalidade.VENDA,
): Promise<void> {
  const campoOwner = campoDono(finalidade);
  const campoPont = campoPonteiro(finalidade);

  const resultado = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      select: { id: true, donoId: true, donoPosVendaId: true },
    });
    if (!lead) return null;

    const negocio = await tx.negocio.findFirst({
      where: { leadId, finalidade, status: StatusNeg.ABERTO },
      orderBy: { criadoEm: "desc" },
      select: { id: true, agenteId: true },
    });
    if (!negocio || negocio.agenteId) return null;

    const config = await tx.configRoteamento.findFirst();
    const donoAtual = lead[campoOwner];

    let alvoId: string | null = null;
    let tipo: AtividadeTipo = AtividadeTipo.ATRIBUICAO;
    let descricao = "";
    let avancarPonteiro = false;

    if (config?.respeitarDono && donoAtual) {
      // 1) Sticky por dono da finalidade.
      alvoId = donoAtual;
      tipo = AtividadeTipo.CONTATO;
      descricao = "Contato recorrente atribuido ao dono";
    } else if (config?.ativo) {
      // 2) Round-robin na fila (acesso) da finalidade.
      const equipe = await tx.agente.findMany({
        where: filtroEquipe(finalidade),
        orderBy: { criadoEm: "asc" },
        select: { id: true, nome: true },
      });
      if (equipe.length > 0) {
        const ponteiroAtual = config[campoPont];
        const idx = ponteiroAtual
          ? equipe.findIndex((v) => v.id === ponteiroAtual)
          : -1;
        const prox = idx === -1 ? 0 : (idx + 1) % equipe.length;
        const escolhido = equipe[prox];
        alvoId = escolhido.id;
        tipo = AtividadeTipo.ATRIBUICAO;
        descricao = `Distribuido por round-robin para ${escolhido.nome}`;
        avancarPonteiro = true;
      }
    }

    if (!alvoId) return null;

    await tx.negocio.update({
      where: { id: negocio.id },
      data: { agenteId: alvoId },
    });
    await tx.lead.update({
      where: { id: leadId },
      data:
        finalidade === Finalidade.VENDA
          ? { donoId: alvoId }
          : { donoPosVendaId: alvoId },
    });
    if (avancarPonteiro && config) {
      await tx.configRoteamento.update({
        where: { id: config.id },
        data:
          finalidade === Finalidade.VENDA
            ? { ponteiroAgenteId: alvoId }
            : { ponteiroPosVendaId: alvoId },
      });
    }
    // Espelha o dono nas conversas abertas dessa finalidade.
    await espelharDonoNasConversas(tx, leadId, finalidade, alvoId);

    await tx.atividade.create({
      data: { leadId, negocioId: negocio.id, agenteId: alvoId, tipo, descricao },
    });
    await tx.historicoNegocio.create({
      data: {
        negocioId: negocio.id,
        agenteId: alvoId,
        tipo: TipoHistorico.ATRIBUICAO,
        descricao,
      },
    });

    return { negocioId: negocio.id };
  });

  if (resultado) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: resultado.negocioId,
      etapaId: null,
      motivo: "roteado",
    });
    getIO()?.emit("conversa:atualizada", { leadId, finalidade });
  }
}

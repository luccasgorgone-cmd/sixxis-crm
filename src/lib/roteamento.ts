// Engine de roteamento de leads. Decide o dono de um lead/negocio recem-criado:
//   1. Sticky: se respeitarDono e o lead ja tem dono -> cai no dono (CONTATO).
//   2. Round-robin: proximo vendedor ativo na ordem de chegada, em ciclo,
//      avancando o ponteiro (ATRIBUICAO).
//   3. Roteamento off / sem vendedores -> fica sem dono.
// Tudo em UMA transacao para evitar corrida no ponteiro do round-robin.
import { prisma } from "./prisma";
import { getIO } from "./socket";
import {
  StatusNeg,
  Papel,
  AtividadeTipo,
  TipoHistorico,
} from "../generated/prisma/enums";

// Idempotente: so atua se houver um negocio ABERTO ainda SEM agente.
export async function rotearLeadNovo(leadId: string): Promise<void> {
  const resultado = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      select: { id: true, donoId: true },
    });
    if (!lead) return null;

    const negocio = await tx.negocio.findFirst({
      where: { leadId, status: StatusNeg.ABERTO },
      orderBy: { criadoEm: "desc" },
      select: { id: true, agenteId: true },
    });
    // Sem negocio aberto ou ja atribuido: nada a rotear.
    if (!negocio || negocio.agenteId) return null;

    const config = await tx.configRoteamento.findFirst();

    let alvoId: string | null = null;
    let tipo: AtividadeTipo = AtividadeTipo.ATRIBUICAO;
    let descricao = "";
    let avancarPonteiro = false;

    // 1) Sticky por dono.
    if (config?.respeitarDono && lead.donoId) {
      alvoId = lead.donoId;
      tipo = AtividadeTipo.CONTATO;
      descricao = "Contato recorrente atribuido ao dono";
    } else if (config?.ativo) {
      // 2) Round-robin por ordem de chegada.
      const vendedores = await tx.agente.findMany({
        where: {
          ativo: true,
          papel: { in: [Papel.VENDEDOR, Papel.POS_VENDA] },
        },
        orderBy: { criadoEm: "asc" },
        select: { id: true, nome: true },
      });
      if (vendedores.length > 0) {
        const idx = config.ponteiroAgenteId
          ? vendedores.findIndex((v) => v.id === config.ponteiroAgenteId)
          : -1;
        const prox = idx === -1 ? 0 : (idx + 1) % vendedores.length;
        const escolhido = vendedores[prox];
        alvoId = escolhido.id;
        tipo = AtividadeTipo.ATRIBUICAO;
        descricao = `Distribuido por round-robin para ${escolhido.nome}`;
        avancarPonteiro = true;
      }
    }

    // 3) Sem alvo: fica sem dono.
    if (!alvoId) return null;

    await tx.negocio.update({
      where: { id: negocio.id },
      data: { agenteId: alvoId },
    });
    await tx.lead.update({
      where: { id: leadId },
      data: { donoId: alvoId },
    });
    if (avancarPonteiro && config) {
      await tx.configRoteamento.update({
        where: { id: config.id },
        data: { ponteiroAgenteId: alvoId },
      });
    }
    await tx.atividade.create({
      data: {
        leadId,
        negocioId: negocio.id,
        agenteId: alvoId,
        tipo,
        descricao,
      },
    });
    // Espelha no historico do negocio para a timeline da 2.2.
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
  }
}

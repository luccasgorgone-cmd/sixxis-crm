// Motor da PROSPECCAO ATIVA (Manual Fase 2). Avanca a cadencia de 4 semanas por
// TEMPO e cria a PRÓXIMA AÇÃO (Lembrete) para o vendedor; no fim da semana 4 sem
// avanco -> NUTRICAO (+90 dias); volta a abordar depois dos 90 dias. NUNCA envia
// mensagem ao cliente. Nasce em DRY-RUN (flag prospeccaoAtiva=false): so loga.
import { prisma } from "../prisma";
import { Finalidade, FaseProspeccao } from "../../generated/prisma/enums";
import { faseEsperada, nutricaoVoltaEm } from "./cadencia";

const ROTULO_FASE: Record<string, string> = {
  ABORDAGEM: "Abordagem",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  FECHAMENTO: "Fechamento",
};

export async function processarProspeccao(): Promise<void> {
  try {
    const cfg = await prisma.configuracaoCRM.findFirst({ select: { prospeccaoAtiva: true } });
    const ativo = cfg?.prospeccaoAtiva === true;
    const agora = new Date();

    // ---- 1) Avanco da cadencia (fases por tempo) ----
    const emCadencia = await prisma.prospeccaoContato.findMany({
      where: {
        fase: { in: [
          FaseProspeccao.ABORDAGEM, FaseProspeccao.QUALIFICACAO,
          FaseProspeccao.PROPOSTA, FaseProspeccao.FECHAMENTO,
        ] },
        primeiroContatoEm: { not: null },
      },
      select: { id: true, leadId: true, agenteId: true, fase: true, primeiroContatoEm: true },
    });

    for (const c of emCadencia) {
      const esperada = faseEsperada(c.primeiroContatoEm!, agora);
      if (esperada === c.fase) continue; // ainda na fase certa
      if (!ativo) {
        console.log(`[prospeccao][dry-run] contato ${c.id}: ${c.fase} -> ${esperada}`);
        continue;
      }
      if (esperada === "NUTRICAO") {
        await prisma.prospeccaoContato.update({
          where: { id: c.id },
          data: { fase: FaseProspeccao.NUTRICAO, nutricaoAte: nutricaoVoltaEm(agora), proximaAcaoEm: null },
        });
        continue;
      }
      // Avanca para a fase esperada e cria a proxima acao pro vendedor.
      await prisma.prospeccaoContato.update({
        where: { id: c.id },
        data: { fase: esperada as FaseProspeccao, proximaAcaoEm: agora },
      });
      if (c.agenteId) {
        await prisma.lembrete.create({
          data: {
            leadId: c.leadId,
            agenteId: c.agenteId,
            finalidade: Finalidade.VENDA,
            dataHora: agora,
            nota: `Prospecção: ${ROTULO_FASE[esperada] ?? esperada} — próxima ação deste contato`,
          },
        });
      }
    }

    // ---- 2) Re-surge NUTRICAO apos 90 dias (nova abordagem) ----
    const paraReabordar = await prisma.prospeccaoContato.findMany({
      where: { fase: FaseProspeccao.NUTRICAO, nutricaoAte: { not: null, lte: agora } },
      select: { id: true, leadId: true, agenteId: true },
    });
    for (const c of paraReabordar) {
      if (!ativo) {
        console.log(`[prospeccao][dry-run] contato ${c.id}: NUTRICAO -> nova ABORDAGEM (90d)`);
        continue;
      }
      await prisma.prospeccaoContato.update({
        where: { id: c.id },
        data: {
          fase: FaseProspeccao.ABORDAGEM,
          primeiroContatoEm: agora,
          proximaAcaoEm: agora,
          tentativas: 0,
          canais: [],
          nutricaoAte: null,
        },
      });
      if (c.agenteId) {
        await prisma.lembrete.create({
          data: {
            leadId: c.leadId,
            agenteId: c.agenteId,
            finalidade: Finalidade.VENDA,
            dataHora: agora,
            nota: "Prospecção: nova abordagem (pós-nutrição de 90 dias)",
          },
        });
      }
    }
  } catch (erro) {
    console.error(`[prospeccao] falha: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

// Tick periodico (a cada 30 min). Chamado no boot. Dry-run quando a flag off.
export function iniciarProspeccao(): void {
  void processarProspeccao();
  setInterval(() => void processarProspeccao(), 30 * 60 * 1000);
}

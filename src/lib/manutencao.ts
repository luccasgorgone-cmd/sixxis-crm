// Manutencao/retencao: poda o campo `raw` (payload bruto pesado) de mensagens
// antigas, preservando o conteudo fundamental (conteudo/transcricao/tipo/direcao/
// hora/statusEnvio/mediaUrl/apagada*). NADA e deletado — so o raw e zerado.
// Opcional (env): arquivar conversas inativas ha muito tempo (sem deletar).
import { prisma } from "./prisma";
import { Prisma } from "../generated/prisma/client";

// Poda o raw de mensagens com mais de RETENCAO_RAW_MESES (default 6).
export async function podarRawAntigo(): Promise<void> {
  const meses = Number(process.env.RETENCAO_RAW_MESES ?? 6);
  if (!Number.isFinite(meses) || meses <= 0) {
    console.log("[manutencao] poda do raw desativada (RETENCAO_RAW_MESES <= 0)");
    return;
  }
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - meses);
  try {
    const r = await prisma.mensagem.updateMany({
      where: { hora: { lt: cutoff }, raw: { not: Prisma.DbNull } },
      data: { raw: Prisma.DbNull },
    });
    if (r.count > 0) {
      console.log(
        `[manutencao] raw podado de ${r.count} mensagens (> ${meses} meses); conteudo preservado`,
      );
    } else {
      console.log("[manutencao] sem raw antigo a podar");
    }
  } catch (erro) {
    console.error(
      `[manutencao] falha ao podar raw: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Opcional (desligado por default): arquiva conversas inativas ha mais de
// ARQUIVAR_INATIVAS_MESES meses (arquivada=true), sem deletar nada.
export async function arquivarConversasInativas(): Promise<void> {
  const meses = Number(process.env.ARQUIVAR_INATIVAS_MESES ?? 0);
  if (!Number.isFinite(meses) || meses <= 0) return;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - meses);
  try {
    const r = await prisma.conversa.updateMany({
      where: { arquivada: false, ultimaMensagemEm: { lt: cutoff } },
      data: { arquivada: true },
    });
    if (r.count > 0) {
      console.log(`[manutencao] ${r.count} conversas inativas arquivadas`);
    }
  } catch (erro) {
    console.error(
      `[manutencao] falha ao arquivar inativas: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Roda a manutencao agora e agenda repeticao diaria. Chamado no boot.
export function iniciarManutencao(): void {
  const rodar = () => {
    void podarRawAntigo();
    void arquivarConversasInativas();
  };
  rodar();
  // Agendamento simples: a cada 24h.
  setInterval(rodar, 24 * 60 * 60 * 1000);
}

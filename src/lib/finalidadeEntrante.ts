// Fatia W — Roteamento da mensagem ENTRANTE pelo setor com atendimento ABERTO.
//
// DECISAO DO DONO: o setor com atendimento ABERTO (Negocio.status = ABERTO)
// vence a finalidade da INSTANCIA (numero de WhatsApp que o cliente usou),
// enquanto estiver aberto. Assim, cliente repassado ao pos-venda que responde
// no numero de VENDA cai na conversa do POS-VENDA (onde ha negocio aberto) —
// nao abre uma conversa de venda nova (o "voltou pro vendedor").
//
// Regras:
//  - Nenhum negocio aberto            -> finalidade da instancia (comportamento
//                                        atual; NAO muda nada).
//  - Exatamente um setor com aberto   -> a finalidade DESSE setor.
//  - Ambos os setores com aberto      -> desempate por ATIVIDADE mais recente:
//    max entre Negocio.atualizadoEm e ultimaMensagemEm da conversa ativa do
//    setor. Empate real -> finalidade da instancia (fallback).
//
// TRAVA CRITICA: NUNCA perder a mensagem. Qualquer falha/ambiguidade cai no
// comportamento atual (finalidade da instancia). A resolucao e uma query barata
// e indexada (Negocio[leadId,status]); so consulta conversas no caso raro de
// empate de setor.
import { prisma } from "./prisma";
import { Finalidade, StatusNeg } from "../generated/prisma/enums";

export type MotivoFinalidade =
  | "instancia" // nenhum negocio aberto: usa a finalidade do numero
  | "unico-aberto" // um setor aberto: vence esse setor
  | "desempate" // dois setores abertos: venceu o de atividade mais recente
  | "fallback"; // erro/empate: caiu na finalidade da instancia

export type ResolucaoFinalidade = {
  finalidade: Finalidade;
  motivo: MotivoFinalidade;
  setorInstancia: Finalidade;
};

export async function resolverFinalidadeEntrante(
  leadId: string,
  finalidadeInstancia: Finalidade,
): Promise<ResolucaoFinalidade> {
  try {
    const abertos = await prisma.negocio.findMany({
      where: { leadId, status: StatusNeg.ABERTO },
      select: { finalidade: true, atualizadoEm: true },
    });

    const setores = new Set(abertos.map((n) => n.finalidade));
    if (setores.size === 0) {
      return {
        finalidade: finalidadeInstancia,
        motivo: "instancia",
        setorInstancia: finalidadeInstancia,
      };
    }
    if (setores.size === 1) {
      return {
        finalidade: abertos[0].finalidade,
        motivo: "unico-aberto",
        setorInstancia: finalidadeInstancia,
      };
    }

    // Ambos os setores com negocio aberto: desempate por atividade mais recente
    // (max entre atualizadoEm do negocio e ultimaMensagemEm da conversa ativa).
    const conversas = await prisma.conversa.findMany({
      where: { leadId, arquivada: false },
      select: { finalidade: true, ultimaMensagemEm: true },
    });
    const escore = (f: Finalidade): number => {
      const tempos = [
        ...abertos
          .filter((n) => n.finalidade === f)
          .map((n) => n.atualizadoEm?.getTime() ?? 0),
        ...conversas
          .filter((c) => c.finalidade === f)
          .map((c) => c.ultimaMensagemEm?.getTime() ?? 0),
      ];
      return tempos.length ? Math.max(...tempos) : 0;
    };
    const eVenda = escore(Finalidade.VENDA);
    const ePos = escore(Finalidade.POS_VENDA);
    if (eVenda === ePos) {
      // Empate real (sem sinal claro): mantem a finalidade da instancia.
      return {
        finalidade: finalidadeInstancia,
        motivo: "fallback",
        setorInstancia: finalidadeInstancia,
      };
    }
    return {
      finalidade: ePos > eVenda ? Finalidade.POS_VENDA : Finalidade.VENDA,
      motivo: "desempate",
      setorInstancia: finalidadeInstancia,
    };
  } catch (erro) {
    // NUNCA perder a mensagem: qualquer falha cai na finalidade da instancia.
    console.warn(
      "[ingest] resolverFinalidadeEntrante falhou; usando finalidade da instancia",
      erro,
    );
    return {
      finalidade: finalidadeInstancia,
      motivo: "fallback",
      setorInstancia: finalidadeInstancia,
    };
  }
}

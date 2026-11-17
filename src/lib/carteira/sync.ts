// Sincronizacao automatica do status do CarteiraContato com a vida real do lead.
//
// FRENTE 6 (bug relatado pelo Luccas): "tem cliente que ja respondeu e nao
// aparece, e tambem quando nao tem interesse e ja foram marcados e nao aparece".
// Causa raiz: NINGUEM escrevia CarteiraStatusContato automaticamente depois da
// ativacao. So havia: import -> NOVO, ativar -> EM_ABORDAGEM, e o botao manual
// (PATCH). Entao os filtros "Respondeu" e "Descartado" da Carteira de Leads
// ficavam sempre vazios, mesmo com o cliente tendo respondido ou sido perdido.
//
// Conserto: dois gatilhos passam a AVANCAR o status aqui —
//   * ingestao de mensagem de entrada do cliente  -> RESPONDEU
//   * negocio fechado PERDIDO (sem interesse)      -> DESCARTADO
//   * negocio fechado GANHO (comprou)              -> CONVERTIDO
// Tudo ADITIVO (nenhuma migracao: os valores do enum ja existem no schema).

import { prisma } from "@/lib/prisma";
import type { CarteiraStatusContato } from "@/generated/prisma/enums";
// Ordem de progressao + regra pura de avanco vivem em ./rank (sem prisma), para
// o contrato dourado c26 travar a logica sem abrir conexao. Re-exporto aqui para
// quem ja importava deveAvancarStatusCarteira de sync.
import { deveAvancarStatusCarteira } from "./rank";
export { deveAvancarStatusCarteira } from "./rank";

// Avanca o status do CarteiraContato ligado a este lead, se existir e se o alvo
// for progressao. No-op silencioso quando o lead nao veio da carteira (a grande
// maioria) ou quando o alvo nao avanca. Idempotente e seguro chamar em qualquer
// ingestao/fechamento — nunca lanca para nao derrubar o fluxo que o chamou.
export async function avancarStatusCarteiraPorLead(
  leadId: string,
  alvo: CarteiraStatusContato,
): Promise<void> {
  try {
    const contato = await prisma.carteiraContato.findUnique({
      where: { leadId },
      select: { id: true, status: true },
    });
    if (!contato) return; // lead nao veio da carteira — nada a sincronizar
    if (!deveAvancarStatusCarteira(contato.status, alvo)) return;
    await prisma.carteiraContato.update({
      where: { id: contato.id },
      data: { status: alvo },
    });
  } catch (e) {
    // Sincronizacao e best-effort: um erro aqui NAO pode derrubar a ingestao da
    // mensagem nem o fechamento do negocio. Loga e segue.
    console.error("[carteira/sync] falha ao avancar status", leadId, alvo, e);
  }
}

// Manutencao da coluna Lead.nomeBusca (Fatia P): nome EFETIVO normalizado para a
// busca server-side do Kanban. PONTO UNICO — todo write que muda nomeManual,
// pushName ou nome deve chamar recalcularNomeBusca(leadId) depois, para a coluna
// nunca ficar desatualizada. A busca ainda tem o cinto-e-suspensorio (casa pelos
// campos crus tambem), mas a coluna e o que da o dobramento de acento.
import { prisma } from "./prisma";
import { nomeBuscaDe } from "./cliente";

// Recalcula e grava Lead.nomeBusca a partir do estado atual do lead. Best-effort:
// nunca lanca (uma falha aqui nao pode quebrar ingestao/edicao). Idempotente.
export async function recalcularNomeBusca(leadId: string): Promise<void> {
  try {
    const l = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { nome: true, pushName: true, nomeManual: true, telefone: true, nomeBusca: true },
    });
    if (!l) return;
    const novo = nomeBuscaDe(l);
    if (novo !== l.nomeBusca) {
      await prisma.lead.update({ where: { id: leadId }, data: { nomeBusca: novo } });
    }
  } catch {
    // Silencioso: a busca tem fallback pelos campos crus.
  }
}

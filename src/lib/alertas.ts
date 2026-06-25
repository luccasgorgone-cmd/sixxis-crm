// Alertas antecipados da agenda: quando (dataHora - lembrarAntesMin) <= agora e
// o item ainda nao foi notificado, gera uma Notificacao no sino e marca
// notificadoEm. Vale para Tarefa e para Lembrete de cliente. Roda a cada ~1-2min.
import { prisma } from "./prisma";
import { nomeEfetivo } from "./cliente";
import { criarNotificacao } from "./notificacao";

function horaCurta(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export async function processarAlertas(): Promise<void> {
  const agora = new Date();
  try {
    // ---- Tarefas pendentes com alerta configurado e ainda nao notificadas ----
    const tarefas = await prisma.tarefa.findMany({
      where: {
        status: "PENDENTE",
        lembrarAntesMin: { not: null },
        notificadoEm: null,
      },
      include: {
        lead: {
          select: { nome: true, pushName: true, nomeManual: true, telefone: true },
        },
      },
    });
    for (const t of tarefas) {
      const limite = t.dataHora.getTime() - (t.lembrarAntesMin ?? 0) * 60_000;
      if (limite > agora.getTime()) continue;
      const cliente = t.lead ? ` — ${nomeEfetivo(t.lead)}` : "";
      await criarNotificacao({
        agenteId: t.agenteId,
        tipo: "TAREFA",
        titulo: `Lembrete: ${t.titulo}`,
        descricao: `Compromisso ${horaCurta(t.dataHora)}${cliente}`,
        link: "/agenda",
        leadId: t.leadId,
      });
      await prisma.tarefa.update({
        where: { id: t.id },
        data: { notificadoEm: agora },
      });
    }

    // ---- Lembretes de cliente com alerta configurado ----
    const lembretes = await prisma.lembrete.findMany({
      where: {
        status: "PENDENTE",
        lembrarAntesMin: { not: null },
        notificadoEm: null,
      },
      include: {
        lead: {
          select: { nome: true, pushName: true, nomeManual: true, telefone: true },
        },
      },
    });
    for (const l of lembretes) {
      const limite = l.dataHora.getTime() - (l.lembrarAntesMin ?? 0) * 60_000;
      if (limite > agora.getTime()) continue;
      const cliente = l.lead ? nomeEfetivo(l.lead) : "cliente";
      await criarNotificacao({
        agenteId: l.agenteId,
        tipo: "LEMBRETE",
        titulo: `Contato agendado: ${cliente}`,
        descricao: `${horaCurta(l.dataHora)}${l.nota ? ` — ${l.nota}` : ""}`,
        link: "/agenda",
        leadId: l.leadId,
      });
      await prisma.lembrete.update({
        where: { id: l.id },
        data: { notificadoEm: agora },
      });
    }
  } catch (erro) {
    console.error(
      `[alertas] falha: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Agenda a verificacao periodica de alertas (a cada 90s). Chamado no boot.
export function iniciarAlertas(): void {
  void processarAlertas();
  setInterval(() => void processarAlertas(), 90_000);
}

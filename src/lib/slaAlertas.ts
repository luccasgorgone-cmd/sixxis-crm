// Alertas de SLA por (finalidade, etapa): quando um Negocio ABERTO passa mais
// tempo na etapa atual do que o configurado, gera um AlertaNegocio + Notificacao
// ao dono e avisa o cliente conectado (som). Fecha o alerta ao mover de etapa /
// ganho / perdido / resolver. SEPARADO dos alertas ANTECIPADOS da agenda
// (lib/alertas.ts), que continuam funcionando sem alteracao.
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { criarNotificacao } from "./notificacao";
import { StatusNeg } from "../generated/prisma/enums";

// Avalia todos os negocios abertos e cria/fecha alertas de SLA conforme a config.
export async function processarSlaAlertas(): Promise<void> {
  const agora = new Date();
  try {
    const configs = await prisma.configAlertaSla.findMany({
      where: { ativo: true },
      select: {
        id: true,
        finalidade: true,
        etapaId: true,
        minutosParaAlerta: true,
        som: true,
      },
    });
    if (configs.length === 0) {
      // Sem config ativa: ainda assim resolve alertas orfaos (etapa/estado mudou).
      await resolverAlertasObsoletos(agora);
      return;
    }
    const mapaConfig = new Map(
      configs.map((c) => [`${c.finalidade}:${c.etapaId}`, c]),
    );

    const negocios = await prisma.negocio.findMany({
      where: { status: StatusNeg.ABERTO, etapaId: { not: null } },
      select: {
        id: true,
        agenteId: true,
        finalidade: true,
        etapaId: true,
        entrouEtapaEm: true,
        lead: {
          select: { nome: true, pushName: true, nomeManual: true, telefone: true },
        },
        etapa: { select: { nome: true } },
        alertasSla: {
          where: { resolvidoEm: null },
          select: { id: true, configId: true },
        },
      },
    });

    for (const n of negocios) {
      const chave = `${n.finalidade}:${n.etapaId}`;
      const config = mapaConfig.get(chave);
      const aberto = n.alertasSla[0] ?? null;

      // Sem config para a etapa atual: fecha qualquer alerta aberto (etapa mudou
      // para uma sem SLA, ou a config foi desativada/removida).
      if (!config) {
        if (aberto) {
          await prisma.alertaNegocio.update({
            where: { id: aberto.id },
            data: { resolvidoEm: agora },
          });
        }
        continue;
      }

      // Alerta aberto de OUTRA etapa (config diferente): resolve e segue.
      if (aberto && aberto.configId !== config.id) {
        await prisma.alertaNegocio.update({
          where: { id: aberto.id },
          data: { resolvidoEm: agora },
        });
      }

      const decorridoMin =
        (agora.getTime() - n.entrouEtapaEm.getTime()) / 60_000;
      const jaTemAlertaDestaEtapa = aberto && aberto.configId === config.id;

      if (decorridoMin >= config.minutosParaAlerta && !jaTemAlertaDestaEtapa) {
        await prisma.alertaNegocio.create({
          data: { negocioId: n.id, configId: config.id },
        });
        const nomeCliente =
          n.lead.nomeManual || n.lead.pushName || n.lead.nome || n.lead.telefone;
        if (n.agenteId) {
          await criarNotificacao({
            agenteId: n.agenteId,
            tipo: "SLA",
            titulo: `Negocio parado: ${n.etapa?.nome ?? "etapa"}`,
            descricao: `${nomeCliente} esta ha tempo demais nesta etapa`,
            link: "/kanban",
            leadId: null,
          });
        }
        // Avisa o cliente conectado para tocar o som e atualizar selos/badge.
        getIO()?.emit("alerta:novo", {
          agenteId: n.agenteId,
          negocioId: n.id,
          som: config.som ?? null,
        });
      }
    }

    await resolverAlertasObsoletos(agora);
    getIO()?.emit("alerta:atualizado", {});
  } catch (erro) {
    console.error(
      `[sla] falha: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Fecha alertas abertos cujo negocio nao esta mais ABERTO (ganho/perdido).
async function resolverAlertasObsoletos(agora: Date): Promise<void> {
  await prisma.alertaNegocio.updateMany({
    where: {
      resolvidoEm: null,
      negocio: { status: { not: StatusNeg.ABERTO } },
    },
    data: { resolvidoEm: agora },
  });
}

// Fecha TODOS os alertas abertos de um negocio (chamar ao mover de etapa /
// ganho / perdido / resolver). Idempotente.
export async function resolverAlertasNegocio(negocioId: string): Promise<void> {
  await prisma.alertaNegocio.updateMany({
    where: { negocioId, resolvidoEm: null },
    data: { resolvidoEm: new Date() },
  });
  getIO()?.emit("alerta:atualizado", { negocioId });
}

// Agenda a verificacao periodica de SLA (a cada 60s). Chamado no boot.
export function iniciarSlaAlertas(): void {
  void processarSlaAlertas();
  setInterval(() => void processarSlaAlertas(), 60_000);
}

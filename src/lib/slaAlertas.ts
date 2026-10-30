// Alertas de SLA por (finalidade, etapa): quando um Negocio ABERTO passa mais
// tempo na etapa atual do que o configurado, gera um AlertaNegocio + Notificacao
// ao dono e avisa o cliente conectado (som). Fecha o alerta ao mover de etapa /
// ganho / perdido / resolver. SEPARADO dos alertas ANTECIPADOS da agenda
// (lib/alertas.ts), que continuam funcionando sem alteracao.
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { criarNotificacao } from "./notificacao";
import { StatusNeg, AlertaNivel } from "../generated/prisma/enums";
import { minutosUteisEntre, normalizarHorarios } from "./horario";
import { nivelSla, MARGEM_AMARELO_MIN } from "./sla/nivel";

// Avalia todos os negocios abertos e cria/fecha alertas de SLA conforme a config.
export async function processarSlaAlertas(): Promise<void> {
  const agora = new Date();
  try {
    // Config global de tempo: quando slaEmDiasUteis=true, o relógio da etapa conta
    // só horário comercial / dias úteis / fora de feriados (Manual de Atendimento).
    // Default (false) preserva o comportamento atual (minutos corridos).
    const cfgCrm = await prisma.configuracaoCRM.findFirst({
      select: { fuso: true, horarios: true, feriados: true, slaEmDiasUteis: true },
    });
    const emDiasUteis = cfgCrm?.slaEmDiasUteis === true;
    const horariosNorm = emDiasUteis ? normalizarHorarios(cfgCrm?.horarios) : null;
    const feriados: string[] = Array.isArray(cfgCrm?.feriados)
      ? (cfgCrm!.feriados as unknown[]).filter((f): f is string => typeof f === "string")
      : [];
    const fuso = cfgCrm?.fuso || "America/Sao_Paulo";

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

    // Etiquetas que afetam o SLA: B2B DOBRA o prazo em Negociando (Manual 3/4,
    // 10 dias vs 5); VIP fica FORA da marcacao (sem amarelo/vermelho, pedido do
    // Luccas). Resolve os ids uma vez; ausente = o fator simplesmente nao se
    // aplica.
    const [etiquetaB2B, etiquetaVip] = await Promise.all([
      prisma.etiqueta.findFirst({ where: { nome: "B2B" }, select: { id: true } }),
      prisma.etiqueta.findFirst({ where: { nome: "VIP" }, select: { id: true } }),
    ]);
    const b2bId = etiquetaB2B?.id ?? "";
    const vipId = etiquetaVip?.id ?? "";
    const idsEtiq = [b2bId, vipId].filter(Boolean);

    const negocios = await prisma.negocio.findMany({
      where: { status: StatusNeg.ABERTO, etapaId: { not: null } },
      select: {
        id: true,
        agenteId: true,
        finalidade: true,
        etapaId: true,
        entrouEtapaEm: true,
        lead: {
          select: {
            nome: true, pushName: true, nomeManual: true, telefone: true,
            etiquetas:
              idsEtiq.length > 0
                ? { where: { etiquetaId: { in: idsEtiq } }, select: { etiquetaId: true } }
                : { where: { etiquetaId: "__nenhuma__" }, select: { etiquetaId: true } },
          },
        },
        etapa: { select: { nome: true } },
        alertasSla: {
          where: { resolvidoEm: null },
          select: { id: true, configId: true, nivel: true },
        },
      },
    });

    for (const n of negocios) {
      const aberto = n.alertasSla[0] ?? null;
      const ehVip = vipId !== "" && n.lead.etiquetas.some((e) => e.etiquetaId === vipId);

      // VIP fica FORA da marcacao: nunca cria alerta; se tiver um aberto (ex.:
      // etiquetado VIP depois de ja estar marcado), resolve para sair da cor.
      if (ehVip) {
        if (aberto) {
          await prisma.alertaNegocio.update({
            where: { id: aberto.id },
            data: { resolvidoEm: agora },
          });
        }
        continue;
      }

      const chave = `${n.finalidade}:${n.etapaId}`;
      const config = mapaConfig.get(chave);

      // Sem config para a etapa atual: fecha qualquer alerta aberto.
      if (!config) {
        if (aberto) {
          await prisma.alertaNegocio.update({
            where: { id: aberto.id },
            data: { resolvidoEm: agora },
          });
        }
        continue;
      }

      // Alerta aberto de OUTRA etapa (config diferente): resolve e trata como se
      // nao houvesse alerta desta etapa.
      let abertoDesta: { id: string; configId: string; nivel: AlertaNivel } | null =
        aberto;
      if (aberto && aberto.configId !== config.id) {
        await prisma.alertaNegocio.update({
          where: { id: aberto.id },
          data: { resolvidoEm: agora },
        });
        abertoDesta = null;
      }

      const decorridoMin = emDiasUteis
        ? minutosUteisEntre(n.entrouEtapaEm, agora, horariosNorm, feriados, fuso)
        : (agora.getTime() - n.entrouEtapaEm.getTime()) / 60_000;

      // B2B dobra o prazo na etapa de Negociando (Manual: B2B 10d vs B2C 5d).
      const ehB2B = b2bId !== "" && n.lead.etiquetas.some((e) => e.etiquetaId === b2bId);
      const emNegociacao = /negoci/i.test(n.etapa?.nome ?? "");
      const limiarMin =
        ehB2B && emNegociacao ? config.minutosParaAlerta * 2 : config.minutosParaAlerta;

      // 3 estados: null (longe) / AMARELO (vencendo, 12h antes) / VERMELHO (atraso).
      const alvo = nivelSla(decorridoMin, limiarMin, MARGEM_AMARELO_MIN);
      const nomeCliente =
        n.lead.nomeManual || n.lead.pushName || n.lead.nome || n.lead.telefone;

      const notificarVermelho = (): void => {
        if (n.agenteId) {
          void criarNotificacao({
            agenteId: n.agenteId,
            tipo: "SLA",
            titulo: `Negocio em atraso: ${n.etapa?.nome ?? "etapa"}`,
            descricao: `${nomeCliente} passou do prazo nesta etapa`,
            link: "/kanban",
            leadId: null,
          });
        }
        getIO()?.emit("alerta:novo", {
          agenteId: n.agenteId,
          negocioId: n.id,
          som: config!.som ?? null,
        });
      };

      if (!alvo) {
        // Ainda longe do prazo: nao deve haver alerta desta etapa (defensivo).
        if (abertoDesta) {
          await prisma.alertaNegocio.update({
            where: { id: abertoDesta.id },
            data: { resolvidoEm: agora },
          });
        }
        continue;
      }

      if (!abertoDesta) {
        // Cria no nivel alvo. Notifica o dono SO se ja entrar direto em VERMELHO
        // (amarelo e aviso visual, sem notificacao, pra nao gerar ruido).
        await prisma.alertaNegocio.create({
          data: { negocioId: n.id, configId: config.id, nivel: alvo as AlertaNivel },
        });
        if (alvo === "VERMELHO") notificarVermelho();
        continue;
      }

      // Ja existe alerta desta etapa: sobe AMARELO -> VERMELHO (nunca regride) e
      // notifica uma vez na virada.
      if (abertoDesta.nivel !== "VERMELHO" && alvo === "VERMELHO") {
        await prisma.alertaNegocio.update({
          where: { id: abertoDesta.id },
          data: { nivel: AlertaNivel.VERMELHO },
        });
        notificarVermelho();
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

// Presenca online do vendedor: estado `Agente.online` + periodos `PresencaPeriodo`
// (abre ao ficar online, fecha `fimEm` ao sair/auto-offline). Idempotente nas duas
// pontas. Ver docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md.
//
// A presenca DIRIGE a elegibilidade no rodizio: online/heartbeat -> disponivel=
// true; offline/inatividade/varredura -> disponivel=false. O roteamento
// (filtroEquipe) continua lendo `disponivel`, agora automatico — antes era um
// toggle manual separado e por isso "ausente nao ficava apos 15min" e o vendedor
// que voltava demorava a receber (clicava online, mas o rodizio olhava outro flag).
import { prisma } from "../prisma";
import { LIMITE_PRESENCA_MS, presencaExpirou } from "./inatividade";

export async function estadoPresenca(
  agenteId: string,
): Promise<{ online: boolean }> {
  const a = await prisma.agente.findUnique({
    where: { id: agenteId },
    select: { online: true },
  });
  return { online: a?.online ?? false };
}

// Fica online. Idempotente no periodo (nao abre duplicado), mas SEMPRE atualiza
// disponivel=true e o heartbeat — assim quem estava disponivel=false (ausente)
// volta ao rodizio na hora ao ficar online.
export async function ficarOnline(
  agenteId: string,
): Promise<{ online: boolean }> {
  return prisma.$transaction(async (tx) => {
    const a = await tx.agente.findUnique({
      where: { id: agenteId },
      select: { online: true },
    });
    if (!a?.online) {
      // Defensivo: fecha qualquer periodo orfao aberto antes de abrir um novo.
      await tx.presencaPeriodo.updateMany({
        where: { agenteId, fimEm: null },
        data: { fimEm: new Date() },
      });
      await tx.presencaPeriodo.create({ data: { agenteId } });
    }
    await tx.agente.update({
      where: { id: agenteId },
      data: { online: true, disponivel: true, ultimaPresencaEm: new Date() },
    });
    return { online: true };
  });
}

// Fica offline. Idempotente: fecha o periodo aberto (se houver), marca offline e
// SAI do rodizio (disponivel=false).
export async function ficarOffline(
  agenteId: string,
): Promise<{ online: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.presencaPeriodo.updateMany({
      where: { agenteId, fimEm: null },
      data: { fimEm: new Date() },
    });
    await tx.agente.update({
      where: { id: agenteId },
      data: { online: false, disponivel: false },
    });
    return { online: false };
  });
}

// Heartbeat do cliente: renova a presenca viva. Mantem online=true + disponivel=
// true e carimba ultimaPresencaEm=agora. Abre periodo se nao houver (ex.: 1o
// heartbeat ao abrir o app = ficar online). Best-effort, idempotente.
export async function registrarHeartbeat(
  agenteId: string,
): Promise<{ online: boolean }> {
  return prisma.$transaction(async (tx) => {
    const a = await tx.agente.findUnique({
      where: { id: agenteId },
      select: { online: true },
    });
    if (!a?.online) {
      await tx.presencaPeriodo.updateMany({
        where: { agenteId, fimEm: null },
        data: { fimEm: new Date() },
      });
      await tx.presencaPeriodo.create({ data: { agenteId } });
    }
    await tx.agente.update({
      where: { id: agenteId },
      data: { online: true, disponivel: true, ultimaPresencaEm: new Date() },
    });
    return { online: true };
  });
}

// Varredura: derruba quem parou de mandar heartbeat (fechou a aba / caiu a rede)
// ha mais de LIMITE_PRESENCA_MS — marca offline + disponivel=false e fecha o
// periodo. So mexe em quem TEM ultimaPresencaEm (entrou no sistema de heartbeat);
// contas legadas (null) ficam como estao, evitando blackout no deploy. Retorna
// quantos derrubou. Nunca lanca.
export async function varrerPresencaInativa(
  limiteMs: number = LIMITE_PRESENCA_MS,
): Promise<number> {
  try {
    const agora = new Date();
    const corte = new Date(agora.getTime() - limiteMs);
    const mortos = await prisma.agente.findMany({
      where: { online: true, ultimaPresencaEm: { not: null, lt: corte } },
      select: { id: true, ultimaPresencaEm: true },
    });
    // Guarda extra via regra pura (trava contrato dourado): so derruba os que
    // realmente expiraram (evita corrida de borda com heartbeat concorrente).
    const ids = mortos
      .filter((m) => presencaExpirou(m.ultimaPresencaEm, agora, limiteMs))
      .map((m) => m.id);
    if (ids.length === 0) return 0;
    await prisma.$transaction(async (tx) => {
      await tx.presencaPeriodo.updateMany({
        where: { agenteId: { in: ids }, fimEm: null },
        data: { fimEm: agora },
      });
      await tx.agente.updateMany({
        where: { id: { in: ids } },
        data: { online: false, disponivel: false },
      });
    });
    return ids.length;
  } catch (e) {
    console.error("[presenca/varredura] falha ao derrubar presencas mortas", e);
    return 0;
  }
}

// Ticker da varredura (servidor). Roda a cada 60s. So no processo que liga os
// timers (ver server.ts, fora do SANDBOX_ONLY).
let tickerPresenca: ReturnType<typeof setInterval> | null = null;
export function iniciarVarreduraPresenca(): void {
  if (tickerPresenca) return;
  tickerPresenca = setInterval(() => void varrerPresencaInativa(), 60_000);
  // Nao segura o event loop por causa deste timer.
  if (typeof tickerPresenca.unref === "function") tickerPresenca.unref();
}

// Presenca online do vendedor: estado `Agente.online` + periodos `PresencaPeriodo`
// (abre ao ficar online, fecha `fimEm` ao sair/auto-offline). Idempotente nas duas
// pontas. Ver docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md.
import { prisma } from "../prisma";

export async function estadoPresenca(
  agenteId: string,
): Promise<{ online: boolean }> {
  const a = await prisma.agente.findUnique({
    where: { id: agenteId },
    select: { online: true },
  });
  return { online: a?.online ?? false };
}

// Fica online. Idempotente: se ja online, no-op (nao abre periodo duplicado).
export async function ficarOnline(
  agenteId: string,
): Promise<{ online: boolean }> {
  return prisma.$transaction(async (tx) => {
    const a = await tx.agente.findUnique({
      where: { id: agenteId },
      select: { online: true },
    });
    if (a?.online) return { online: true };
    // Defensivo: fecha qualquer periodo orfao aberto antes de abrir um novo.
    await tx.presencaPeriodo.updateMany({
      where: { agenteId, fimEm: null },
      data: { fimEm: new Date() },
    });
    await tx.agente.update({ where: { id: agenteId }, data: { online: true } });
    await tx.presencaPeriodo.create({ data: { agenteId } });
    return { online: true };
  });
}

// Fica offline. Idempotente: fecha o periodo aberto (se houver) e marca offline.
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
      data: { online: false },
    });
    return { online: false };
  });
}

// Aplica uma etiqueta ao lead POR NOME (cria a etiqueta na 1a vez). Idempotente.
// Fonte única usada por fluxos automáticos: "Reativado" (reaquisição, Manual
// secao 8) e "transferido do agente" (handoff da Luna, Manual secao 5). Evita
// repetir a lógica de find/create + LeadEtiqueta em vários lugares.
import { prisma } from "./prisma";
import { Finalidade } from "../generated/prisma/enums";

export async function aplicarEtiquetaPorNome(
  leadId: string,
  nome: string,
  opts: { cor?: string; finalidade?: Finalidade | null } = {},
): Promise<void> {
  try {
    const existente = await prisma.etiqueta.findFirst({
      where: { nome },
      select: { id: true },
    });
    const etiqueta =
      existente ??
      (await prisma.etiqueta.create({
        data: {
          nome,
          cor: opts.cor ?? "#3cbfb3",
          finalidade: opts.finalidade ?? null,
        },
        select: { id: true },
      }));
    await prisma.leadEtiqueta.upsert({
      where: { leadId_etiquetaId: { leadId, etiquetaId: etiqueta.id } },
      update: {},
      create: { leadId, etiquetaId: etiqueta.id },
    });
  } catch (e) {
    console.warn(
      `[etiquetaAuto] falha ao aplicar "${nome}" no lead ${leadId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

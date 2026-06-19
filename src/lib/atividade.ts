// Helper para registrar uma Atividade (linha do tempo do CLIENTE/lead).
// Usado pelas rotas de API. No worker (roteamento) a Atividade e criada dentro
// da transacao para garantir atomicidade com o ponteiro do round-robin.
import { prisma } from "./prisma";
import type { AtividadeTipo } from "../generated/prisma/enums";

export async function registrarAtividade(dados: {
  leadId: string;
  negocioId?: string | null;
  agenteId?: string | null;
  tipo: AtividadeTipo;
  descricao: string;
}): Promise<void> {
  await prisma.atividade.create({
    data: {
      leadId: dados.leadId,
      negocioId: dados.negocioId ?? null,
      agenteId: dados.agenteId ?? null,
      tipo: dados.tipo,
      descricao: dados.descricao,
    },
  });
}

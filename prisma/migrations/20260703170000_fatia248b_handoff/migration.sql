-- Fatia 2.48-B: handoff da Luna. ADITIVO, sem DROP: marca quando a conversa foi
-- transferida para um humano (a Luna para de responder aquele lead).

-- AlterTable
ALTER TABLE "Conversa" ADD COLUMN     "handoffFeitoEm" TIMESTAMP(3);

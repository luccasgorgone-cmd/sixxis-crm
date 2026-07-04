-- Fatia 2.81 (BLOCO D): arquivamento de cliente (admin). ADITIVO, sem DROP.
-- Cliente COM historico e arquivado (some das listas) em vez de apagado.
ALTER TABLE "Lead" ADD COLUMN "arquivado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "arquivadoEm" TIMESTAMP(3);

-- Fatia P (Bloco 2): busca server-side do Kanban por nome EFETIVO normalizado.
-- ADITIVO, sem DROP: adiciona Lead.nomeBusca (nome efetivo sem acento/minusculas,
-- mantido pelo app) + indice. O backfill dos leads existentes roda no seed
-- (idempotente), pois exige normalizacao NFD que o app faz melhor que o SQL.

ALTER TABLE "Lead" ADD COLUMN "nomeBusca" TEXT;

CREATE INDEX "Lead_nomeBusca_idx" ON "Lead"("nomeBusca");

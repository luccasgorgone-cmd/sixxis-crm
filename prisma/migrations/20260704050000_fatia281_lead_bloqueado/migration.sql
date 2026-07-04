-- Fatia 2.81 (BLOCO E): bloqueio de contato (admin). ADITIVO, sem DROP.
-- Contato bloqueado: a ingestao registra mas nao notifica/roteia/responde.
ALTER TABLE "Lead" ADD COLUMN "bloqueado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "bloqueadoEm" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "bloqueadoPor" TEXT;

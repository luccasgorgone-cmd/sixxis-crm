-- Fatia 2.85 (BLOCO D): reply (mensagem citada). ADITIVO, sem DROP.
ALTER TABLE "Mensagem" ADD COLUMN "respostaAId" TEXT;
CREATE INDEX "Mensagem_respostaAId_idx" ON "Mensagem"("respostaAId");

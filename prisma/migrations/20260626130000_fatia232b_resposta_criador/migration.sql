-- Fatia 2.32 Parte B: respostas rapidas pessoais do atendente. Aditivo.
-- criadoPorId null = resposta de SISTEMA (global); preenchido = pessoal.

ALTER TABLE "RespostaRapida" ADD COLUMN "criadoPorId" TEXT;

CREATE INDEX "RespostaRapida_criadoPorId_idx" ON "RespostaRapida" ("criadoPorId");

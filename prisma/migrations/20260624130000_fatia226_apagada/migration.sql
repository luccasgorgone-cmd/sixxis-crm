-- Fatia 2.26: apagamento (revoke) de mensagens, preservando o conteudo. Aditivo.
ALTER TYPE "AtividadeTipo" ADD VALUE 'MENSAGEM_APAGADA';

ALTER TABLE "Mensagem" ADD COLUMN "apagada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "apagadaEm" TIMESTAMP(3),
ADD COLUMN "apagadaPor" TEXT,
ADD COLUMN "apagadaPorId" TEXT;

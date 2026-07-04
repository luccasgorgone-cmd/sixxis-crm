-- Fatia 2.81 (BLOCO F): edicao de mensagem enviada (estilo WhatsApp). ADITIVO.
ALTER TABLE "Mensagem" ADD COLUMN "editada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mensagem" ADD COLUMN "editadaEm" TIMESTAMP(3);
ALTER TABLE "Mensagem" ADD COLUMN "conteudoOriginal" TEXT;

-- Fatia 2.78: interruptor MESTRE de mensagens automaticas. ADITIVO, default FALSE.
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN "mensagensAutomaticasAtivas" BOOLEAN NOT NULL DEFAULT false;

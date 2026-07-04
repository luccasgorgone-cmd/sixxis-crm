-- Fatia URGENTE: interruptor do aviso automatico de FORA DE HORARIO.
-- ADITIVO, sem DROP. Default false => nada e enviado automaticamente ate ligar.
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN "avisoForaHorarioAtivo" BOOLEAN NOT NULL DEFAULT false;

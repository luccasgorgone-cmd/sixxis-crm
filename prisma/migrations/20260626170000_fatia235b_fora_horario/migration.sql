-- Fatia 2.35 Parte B: marca da ultima auto-resposta de "fora do horario" por
-- conversa (evita repetir). Aditivo.

ALTER TABLE "Conversa" ADD COLUMN "foraHorarioAvisadoEm" TIMESTAMP(3);

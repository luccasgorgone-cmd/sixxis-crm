-- DESQUALIFICADO (Manual secao 7): perda que nao e cliente possivel. Derivado do
-- tipo do motivoPerda. ADITIVO: 1 coluna nova, default false. Sem DROP/TEMP.
ALTER TABLE "Negocio" ADD COLUMN     "desqualificado" BOOLEAN NOT NULL DEFAULT false;

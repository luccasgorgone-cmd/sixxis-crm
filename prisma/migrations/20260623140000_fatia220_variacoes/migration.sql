-- Fatia 2.20: variacoes de redacao nos modelos + copia na campanha. Aditivo.
ALTER TABLE "RespostaRapida" ADD COLUMN "variacoes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campanha" ADD COLUMN "variacoesJson" JSONB;

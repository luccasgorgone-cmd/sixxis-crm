-- Reaquisicao mensal (Manual secao 8): modo de publico + janela na campanha.
-- ADITIVO: novo enum RecapModo + 3 colunas (default preserva comportamento). Sem DROP/TEMP.
CREATE TYPE "RecapModo" AS ENUM ('ABERTO_ENTRADA', 'PERDIDOS_MES');
ALTER TABLE "CampanhaRecaptacao" ADD COLUMN     "modo" "RecapModo" NOT NULL DEFAULT 'ABERTO_ENTRADA';
ALTER TABLE "CampanhaRecaptacao" ADD COLUMN     "periodoInicio" DATE;
ALTER TABLE "CampanhaRecaptacao" ADD COLUMN     "periodoFim" DATE;

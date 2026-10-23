-- Fundacao de tempo UTIL para os SLAs (Manual de Atendimento). ADITIVO: 2 colunas
-- novas em ConfiguracaoCRM. Sem DROP/TEMP. slaEmDiasUteis nasce false (no-op).
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN     "feriados" JSONB;
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN     "slaEmDiasUteis" BOOLEAN NOT NULL DEFAULT false;

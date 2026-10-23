-- Regua de follow-up (Manual secao 5) + regra de retorno (secao 6). ADITIVO:
-- 3 colunas novas. Sem DROP/TEMP. followupAtivo nasce false (dry-run/no-op).
ALTER TABLE "Negocio" ADD COLUMN     "vezesRetorno" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Etapa" ADD COLUMN     "diasUteisMax" INTEGER;
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN     "followupAtivo" BOOLEAN NOT NULL DEFAULT false;

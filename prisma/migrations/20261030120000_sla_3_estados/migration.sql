-- SLA em 3 estados (amarelo/vermelho) + reinicio one-time da marcacao.
-- ADITIVO: um enum novo e duas colunas novas com DEFAULT. Nenhum DROP, nenhuma
-- coluna/tabela existente alterada, nenhum dado destruido. Idempotente
-- (duplicate_object / IF NOT EXISTS) para sobreviver a reaplicacao.
--
-- AlertaNegocio.nivel default VERMELHO = os alertas ja existentes (que nasceram
-- como atraso) permanecem vermelhos sem backfill. ConfiguracaoCRM.
-- slaMarcacaoReiniciada default false = o reinicio roda uma vez no boot (seed).

DO $$ BEGIN
  CREATE TYPE "AlertaNivel" AS ENUM ('AMARELO', 'VERMELHO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "AlertaNegocio"
  ADD COLUMN IF NOT EXISTS "nivel" "AlertaNivel" NOT NULL DEFAULT 'VERMELHO';

ALTER TABLE "ConfiguracaoCRM"
  ADD COLUMN IF NOT EXISTS "slaMarcacaoReiniciada" BOOLEAN NOT NULL DEFAULT false;

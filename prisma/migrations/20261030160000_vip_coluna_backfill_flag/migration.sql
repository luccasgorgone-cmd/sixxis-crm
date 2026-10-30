-- Sentinela do backfill one-time dos VIP para a coluna VIP.
-- ADITIVO: uma coluna boolean com default. Nenhum DROP, nada destrutivo.
-- Idempotente (IF NOT EXISTS). O backfill em si (mover os negocios) roda no seed.

ALTER TABLE "ConfiguracaoCRM"
  ADD COLUMN IF NOT EXISTS "vipColunaReiniciada" BOOLEAN NOT NULL DEFAULT false;

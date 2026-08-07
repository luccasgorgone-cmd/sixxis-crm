-- Tipo do GANHO no pos-venda: "So duvida" / "Pagamento" / "Garantia", escolhido
-- no fechamento e usado para separar os resolvidos nos relatorios.
--
-- ADITIVA e IDEMPOTENTE: cria um enum novo e UMA coluna nullable. Nenhum DROP,
-- nenhum UPDATE, nenhum backfill — o campo nasce NULL para todo negocio que ja
-- existe (inclusive os ganhos antigos, que os relatorios mostram como "nao
-- classificado"). A VENDA nunca preenche este campo.

DO $$ BEGIN
  CREATE TYPE "TipoGanho" AS ENUM ('DUVIDA', 'PAGAMENTO', 'GARANTIA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "tipoGanho" "TipoGanho";

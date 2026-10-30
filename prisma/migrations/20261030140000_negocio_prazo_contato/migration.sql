-- "A Prazo": data de recontato do cliente no card parado na coluna A Prazo.
-- ADITIVO: uma coluna nova, nullable, sem default destrutivo. Nenhum DROP,
-- nenhuma coluna/tabela existente alterada. Idempotente (IF NOT EXISTS).
-- As etapas "A Prazo"/"VIP" e a etiqueta azul "A Prazo" sao criadas por seed
-- (linhas), nao por migration.

ALTER TABLE "Negocio"
  ADD COLUMN IF NOT EXISTS "prazoContatoAte" TIMESTAMP(3);

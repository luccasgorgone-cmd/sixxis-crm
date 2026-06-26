-- Fatia 2.31A (corrigida): unificacao da conversa por (leadId, finalidade).
-- Sem temp tables (causa do P3018). Idempotente. Sem DROP. Sem perda de dados.

-- 1) Colunas de origem da mensagem (idempotente).
ALTER TABLE "Mensagem" ADD COLUMN IF NOT EXISTS "instancia" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN IF NOT EXISTS "instanciaId" TEXT;

-- 2) Backfill: cada mensagem herda instancia/instanciaId da sua conversa (idempotente).
UPDATE "Mensagem" m
SET "instancia" = c."instancia", "instanciaId" = c."instanciaId"
FROM "Conversa" c
WHERE m."conversaId" = c."id" AND m."instancia" IS NULL AND m."instanciaId" IS NULL;

-- 3) MERGE de conversas ATIVAS (arquivada=false) duplicadas por (leadId, finalidade).
--    Canonica = ativa de maior ultimaMensagemEm; senao mais antiga. Arquivadas ficam intactas.

-- 3.1) Repoint das mensagens das duplicatas ativas para a canonica.
WITH ativos AS (
  SELECT "id","leadId","finalidade","naoLidas","ultimaMensagemEm","criadoEm"
  FROM "Conversa" WHERE "arquivada" = false
),
ranked AS (
  SELECT a.*,
    ROW_NUMBER() OVER (PARTITION BY "leadId","finalidade"
      ORDER BY "ultimaMensagemEm" DESC NULLS LAST, "criadoEm" ASC, "id" ASC) AS rn,
    COUNT(*) OVER (PARTITION BY "leadId","finalidade") AS grp_count
  FROM ativos a
),
canon AS (SELECT "leadId","finalidade","id" AS canon_id FROM ranked WHERE rn = 1 AND grp_count > 1),
dups AS (
  SELECT r."id" AS dup_id, c.canon_id
  FROM ranked r JOIN canon c ON c."leadId" = r."leadId" AND c."finalidade" = r."finalidade"
  WHERE r.rn > 1
)
UPDATE "Mensagem" m SET "conversaId" = d.canon_id FROM dups d WHERE m."conversaId" = d.dup_id;

-- 3.2) Soma naoLidas + maior ultimaMensagemEm na canonica; reabre.
WITH ativos AS (
  SELECT "id","leadId","finalidade","naoLidas","ultimaMensagemEm","criadoEm"
  FROM "Conversa" WHERE "arquivada" = false
),
ranked AS (
  SELECT a.*,
    ROW_NUMBER() OVER (PARTITION BY "leadId","finalidade"
      ORDER BY "ultimaMensagemEm" DESC NULLS LAST, "criadoEm" ASC, "id" ASC) AS rn,
    COUNT(*) OVER (PARTITION BY "leadId","finalidade") AS grp_count
  FROM ativos a
),
canon AS (SELECT "leadId","finalidade","id" AS canon_id FROM ranked WHERE rn = 1 AND grp_count > 1),
agg AS (
  SELECT c.canon_id, SUM(r."naoLidas") AS soma, MAX(r."ultimaMensagemEm") AS maxu
  FROM canon c JOIN ranked r ON r."leadId" = c."leadId" AND r."finalidade" = c."finalidade"
  GROUP BY c.canon_id
)
UPDATE "Conversa" conv
SET "naoLidas" = a.soma, "ultimaMensagemEm" = a.maxu, "status" = 'aberta'
FROM agg a WHERE conv."id" = a.canon_id;

-- 3.3) Arquiva as duplicatas ativas (preservadas, nunca deletadas).
WITH ativos AS (
  SELECT "id","leadId","finalidade","ultimaMensagemEm","criadoEm"
  FROM "Conversa" WHERE "arquivada" = false
),
ranked AS (
  SELECT a.*,
    ROW_NUMBER() OVER (PARTITION BY "leadId","finalidade"
      ORDER BY "ultimaMensagemEm" DESC NULLS LAST, "criadoEm" ASC, "id" ASC) AS rn,
    COUNT(*) OVER (PARTITION BY "leadId","finalidade") AS grp_count
  FROM ativos a
),
canon AS (SELECT "leadId","finalidade","id" AS canon_id FROM ranked WHERE rn = 1 AND grp_count > 1),
dups AS (
  SELECT r."id" AS dup_id
  FROM ranked r JOIN canon c ON c."leadId" = r."leadId" AND c."finalidade" = r."finalidade"
  WHERE r.rn > 1
)
UPDATE "Conversa" conv SET "arquivada" = true FROM dups d WHERE conv."id" = d.dup_id;

-- 4) Indice unico PARCIAL: no maximo UMA conversa ativa por (leadId, finalidade).
CREATE UNIQUE INDEX IF NOT EXISTS "Conversa_leadId_finalidade_key"
  ON "Conversa" ("leadId", "finalidade") WHERE "arquivada" = false;

-- Fatia 2.31 Parte A: unificacao DEFINITIVA da conversa por (leadId, finalidade).
-- Aditivo, sem DROP, sem perder dados. Ordem obrigatoria:
--   1) colunas de origem na Mensagem  2) backfill  3) merge de duplicatas
--   4) indice unico PARCIAL (so depois do merge).

-- ============================================================================
-- 1) Colunas de origem da mensagem (qual numero originou/enviou).
-- ============================================================================
ALTER TABLE "Mensagem" ADD COLUMN "instancia" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN "instanciaId" TEXT;

-- ============================================================================
-- 2) Backfill: cada mensagem herda a instancia/instanciaId da sua conversa.
-- ============================================================================
UPDATE "Mensagem" m
SET "instancia" = c."instancia",
    "instanciaId" = c."instanciaId"
FROM "Conversa" c
WHERE m."conversaId" = c."id";

-- ============================================================================
-- 3) MERGE de duplicatas por (leadId, finalidade) com mais de uma Conversa.
--    Canonica = preferir a NAO-arquivada de maior ultimaMensagemEm; senao a
--    mais antiga (menor criadoEm). Repoint das mensagens das demais para a
--    canonica, soma de naoLidas, ultimaMensagemEm = maior do grupo, canonica
--    reaberta; demais marcadas arquivada=true. NUNCA deletar.
-- ============================================================================

-- 3.1) Ranking dentro de cada grupo + contagem do grupo.
CREATE TEMP TABLE _conv_rank ON COMMIT DROP AS
SELECT
  "id",
  "leadId",
  "finalidade",
  "naoLidas",
  "ultimaMensagemEm",
  ROW_NUMBER() OVER (
    PARTITION BY "leadId", "finalidade"
    ORDER BY
      ("arquivada") ASC,
      (CASE WHEN "arquivada" = false THEN "ultimaMensagemEm" END) DESC NULLS LAST,
      (CASE WHEN "arquivada" = true  THEN "criadoEm"         END) ASC  NULLS LAST,
      "id" ASC
  ) AS rn,
  COUNT(*) OVER (PARTITION BY "leadId", "finalidade") AS grp_count
FROM "Conversa";

-- 3.2) Canonica de cada grupo que tem duplicatas (grp_count > 1).
CREATE TEMP TABLE _conv_canon ON COMMIT DROP AS
SELECT r."leadId", r."finalidade", r."id" AS canon_id
FROM _conv_rank r
WHERE r.rn = 1 AND r.grp_count > 1;

-- 3.3) Mapa duplicata -> canonica.
CREATE TEMP TABLE _conv_dups ON COMMIT DROP AS
SELECT r."id" AS dup_id, c.canon_id
FROM _conv_rank r
JOIN _conv_canon c
  ON c."leadId" = r."leadId" AND c."finalidade" = r."finalidade"
WHERE r.rn > 1;

-- 3.4) Repoint de TODAS as mensagens das duplicatas para a canonica.
UPDATE "Mensagem" m
SET "conversaId" = d.canon_id
FROM _conv_dups d
WHERE m."conversaId" = d.dup_id;

-- 3.5) Agregados do grupo (soma de naoLidas, maior ultimaMensagemEm).
CREATE TEMP TABLE _conv_agg ON COMMIT DROP AS
SELECT c.canon_id,
       SUM(r."naoLidas")        AS soma_nao_lidas,
       MAX(r."ultimaMensagemEm") AS max_ultima
FROM _conv_canon c
JOIN _conv_rank r
  ON r."leadId" = c."leadId" AND r."finalidade" = c."finalidade"
GROUP BY c.canon_id;

-- 3.6) Aplica na canonica: soma naoLidas, ultimaMensagemEm do grupo, reabre.
UPDATE "Conversa" conv
SET "naoLidas" = a.soma_nao_lidas,
    "ultimaMensagemEm" = a.max_ultima,
    "status" = 'aberta',
    "arquivada" = false
FROM _conv_agg a
WHERE conv."id" = a.canon_id;

-- 3.7) Marca as duplicatas como arquivadas (preservadas, nunca deletadas).
UPDATE "Conversa" conv
SET "arquivada" = true
FROM _conv_dups d
WHERE conv."id" = d.dup_id;

-- ============================================================================
-- 4) Indice unico PARCIAL: no maximo UMA conversa ATIVA (nao arquivada) por
--    (leadId, finalidade). Conversas arquivadas (historico) ficam de fora,
--    por isso preservamos as duplicatas sem violar a unicidade.
--    Nome casa com o gerado pelo @@unique([leadId, finalidade]).
-- ============================================================================
CREATE UNIQUE INDEX "Conversa_leadId_finalidade_key"
  ON "Conversa" ("leadId", "finalidade")
  WHERE "arquivada" = false;

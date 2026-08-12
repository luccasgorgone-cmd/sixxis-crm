-- Fatia 3/4 (Bloco 1) — CONTADOR de fechamentos no Negocio.
-- ADITIVO: duas colunas novas com DEFAULT 0. Nenhum DROP, nenhuma coluna
-- alterada, nenhuma linha tocada. Todo negocio existente nasce com 0 aqui; o
-- backfill de quem ja tem historico vem na migracao seguinte (Bloco 2).
--
-- POR QUE: hoje so existem os BOOLEANOS jaFoiPerdido/jaFoiGanho (sim/nao). O
-- vendedor precisa saber QUANTAS vezes o cliente ja foi e voltou. Como os
-- booleanos, estes contadores sao HISTORIA: so sobem, nunca descem.

ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "vezesPerdido" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "vezesGanho" INTEGER NOT NULL DEFAULT 0;

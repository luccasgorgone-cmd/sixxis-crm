-- Frente 4: ganho de RETORNO sem valor. Um cliente que ja comprou (negocio
-- jaFoiGanho) volta so para tirar duvida, pedir codigo de rastreio ou outro
-- motivo -> fecha como GANHO com valor ZERO, marcado com o motivo. Nao dispara
-- Purchase no Meta (gate valor>0) nem soma faturamento (valorGanho=0).
--
-- ADITIVA e IDEMPOTENTE: so adiciona DOIS valores ao enum TipoGanho que ja
-- existe. Nenhum DROP, nenhum UPDATE, nenhum backfill. ADD VALUE IF NOT EXISTS
-- roda fora de qualquer uso do valor no mesmo bloco (Postgres exige), e aqui so
-- adicionamos — mesmo padrao ja usado em migracoes anteriores (ex.: StatusEnvio
-- 'LIDA').

ALTER TYPE "TipoGanho" ADD VALUE IF NOT EXISTS 'RASTREIO';
ALTER TYPE "TipoGanho" ADD VALUE IF NOT EXISTS 'OUTRO';

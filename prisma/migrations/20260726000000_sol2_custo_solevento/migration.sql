-- SOL-2: captura de custo na telemetria da Sol.
-- ADITIVO: so ADD COLUMN, todas OPCIONAIS. Nenhum DROP, nenhuma coluna alterada,
-- nenhum dado tocado. IF NOT EXISTS para ser idempotente (o `prisma migrate
-- deploy` do start roda em todo deploy).
--
-- POR QUE: SolEvento ja registrava a DECISAO da Sol (responder/handoff/silenciar/
-- colisao_humano) mas nao o CONSUMO, entao nao dava para responder "quanto a Sol
-- custou" — que e a pergunta que decide se ela fica ligada.
--
-- NULL vs 0 tem significado diferente aqui, de proposito:
--   NULL  = evento ANTIGO, anterior a esta fatia (nunca mediu nada).
--   0     = decisao que realmente nao chamou a IA (colisao com humano, teto de
--           mensagens, sem chave) — medimos e o consumo foi zero.
-- O dashboard soma tratando NULL como ausencia, nao como zero.
--
-- custoEstimado fica NULL tambem quando o modelo do evento nao esta na tabela de
-- precos (lib/custoIA.ts): melhor sem numero do que com numero chutado. Os
-- tokens sao gravados de qualquer forma.
-- Decimal(10,5): uma decisao custa fracao de centavo de dolar; 5 casas seguram
-- isso sem arredondar para zero.

ALTER TABLE "SolEvento" ADD COLUMN IF NOT EXISTS "tokensEntrada" INTEGER;
ALTER TABLE "SolEvento" ADD COLUMN IF NOT EXISTS "tokensSaida" INTEGER;
ALTER TABLE "SolEvento" ADD COLUMN IF NOT EXISTS "custoEstimado" DECIMAL(10,5);

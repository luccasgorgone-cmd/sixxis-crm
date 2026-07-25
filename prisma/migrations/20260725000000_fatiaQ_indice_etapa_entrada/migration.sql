-- Fatia Q: indice que faz a paginacao das colunas do Kanban valer a pena.
-- ADITIVO: so CREATE INDEX. Nenhum DROP, nenhuma coluna alterada, nenhum dado
-- tocado. IF NOT EXISTS para ser idempotente (o `prisma migrate deploy` do
-- start roda em todo deploy).
--
-- POR QUE: /api/negocios e a rota mais quente do sistema (o Kanban recarrega a
-- cada filtro, a cada evento de tempo real e a cada volta de foco). A Fatia Q
-- passou a pedir 51 linhas por coluna com
--     WHERE "etapaId" = $1 ... ORDER BY "entrouEtapaEm" DESC, "id" DESC
-- e o formato deste indice e EXATAMENTE o desse ORDER BY. Sem ele o Postgres
-- casa por (etapaId, status), ordena a coluna INTEIRA e so entao aplica o
-- LIMIT — ou seja, a coluna "Novo" (1.241 cards em producao, funil crescendo
-- ~80 cards/dia) continuaria sendo ordenada por completo a cada carregamento e
-- a paginacao economizaria payload sem economizar banco. Com o indice o plano
-- vira Index Scan e para na 51a linha.
--
-- DECISAO CONSCIENTE: criado SEM medicao local. O ambiente de desenvolvimento
-- nao tem acesso a banco algum (sem .env, Railway CLI deslogado, Docker
-- indisponivel), e o dono julgou o custo de um indice possivelmente redundante
-- menor que o de trafegar credencial de producao ou deixar a rota degradar com
-- o crescimento do funil. A verificacao a posteriori esta em
-- scripts/medirFatiaQ.ts (READ-ONLY): o EXPLAIN dele deve mostrar Index Scan
-- usando este indice.
--
-- So as colunas ATIVAS ganham indice: as terminais ordenam por fechadoEm e sao
-- pequenas (8 em "Vendido", 0 em "Perdido"), entao nao justificam um segundo.

CREATE INDEX IF NOT EXISTS "Negocio_etapa_entrada_idx"
  ON "Negocio" ("etapaId", "entrouEtapaEm" DESC, "id" DESC);

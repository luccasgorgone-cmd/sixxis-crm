-- =============================================================================
-- APLICAR MANUALMENTE — NAO MOVER PARA prisma/migrations AINDA.
-- =============================================================================
-- Este arquivo esta FORA de prisma/migrations DE PROPOSITO. O deploy roda
-- `prisma migrate deploy` no boot (package.json: "start"), entao qualquer coisa
-- dentro de prisma/migrations e aplicada sozinha na proxima subida. Este SQL NAO
-- PODE rodar sozinho: criar um indice UNICO numa tabela que ainda tem duplicados
-- FALHA, e uma migracao que falha DERRUBA O DEPLOY.
--
-- SO APLICAR DEPOIS QUE:
--   1) POST /api/admin/corrigir-duplicados tiver sido executado em producao; e
--   2) GET /api/admin/corrigir-duplicados (previa) devolver totalGrupos = 0.
-- A consulta de conferencia abaixo confirma o mesmo direto no banco.
--
-- O QUE FAZ: espelha no Negocio a protecao que a Conversa ja tem desde a fatia
-- 231a — no MAXIMO UM registro ATIVO por (leadId, finalidade). Indice PARCIAL
-- (WHERE arquivado = false) para que o historico continue livre: um lead pode ter
-- quantos negocios ARQUIVADOS quiser daquela finalidade; o que o banco passa a
-- recusar e um SEGUNDO negocio nao arquivado.
--
-- ZERO DROP: so cria indice. Nao apaga, nao altera coluna, nao move linha.
--
-- COMO APLICAR (psql conectado no banco de producao):
--   psql "$DATABASE_URL" -f prisma/manual/20260812020000_negocio_unico_ativo.sql
-- Sem CONCURRENTLY de proposito: a tabela e pequena (poucos milhares de linhas),
-- a criacao leva milissegundos, e CONCURRENTLY nao roda em transacao e pode
-- deixar indice INVALIDO se falhar no meio.
-- =============================================================================

-- 1) CONFERENCIA — tem que voltar VAZIO. Cada linha aqui e um duplicado que
--    ainda quebraria a criacao do indice. Se vier alguma, PARE e rode a rota
--    /api/admin/corrigir-duplicados antes.
SELECT "leadId", "finalidade", COUNT(*) AS ativos
  FROM "Negocio"
 WHERE "arquivado" = false
 GROUP BY "leadId", "finalidade"
HAVING COUNT(*) > 1;

-- 2) A TRAVA. IF NOT EXISTS para ser seguro rodar duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS "Negocio_leadId_finalidade_ativo_key"
  ON "Negocio" ("leadId", "finalidade") WHERE "arquivado" = false;

-- 3) DEPOIS DE APLICAR: registrar no historico do Prisma para o schema nao
--    divergir. Copiar este arquivo para
--    prisma/migrations/20260812020000_negocio_unico_ativo/migration.sql
--    (sem a consulta de conferencia do passo 1 — SELECT nao pertence a
--    migracao) e marcar como ja aplicada, para o migrate deploy nao tentar
--    executa-la de novo:
--      npx prisma migrate resolve --applied 20260812020000_negocio_unico_ativo
--
--    NAO declarar @@unique([leadId, finalidade]) no schema.prisma do Negocio: o
--    Prisma nao sabe expressar indice PARCIAL, entao ele geraria um unique
--    TOTAL — que quebraria justamente por causa dos negocios ARQUIVADOS
--    duplicados, que sao legitimos e continuam la. Pelo mesmo motivo o indice
--    fica documentado so em comentario no schema.

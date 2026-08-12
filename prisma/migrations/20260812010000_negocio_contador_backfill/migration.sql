-- Fatia 3/4 (Bloco 2) — BACKFILL dos contadores. So UPDATE nas duas colunas
-- criadas na migracao anterior. Nenhum DROP, nenhuma linha removida, nenhuma
-- outra coluna tocada.
--
-- QUEM ENTRA: negocio com o booleano true e o contador ainda em 0. Isso e o que
-- torna a migracao IDEMPOTENTE — depois de rodar, o contador deixa de ser 0 e a
-- linha nao e mais elegivel; rodar de novo nao muda nada. E tambem o que protege
-- o contador PRECISO daqui para frente: a partir do incremento na transicao
-- (Bloco 3), nenhum backfill volta a mexer nessas linhas.
--
-- DE ONDE VEM O NUMERO: do proprio HistoricoNegocio. Cada perda grava uma linha
-- tipo='PERDA' e cada ganho uma tipo='GANHO' (ver o PATCH de /api/negocios/[id]),
-- entao COUNT(*) e a quantidade REAL de vezes — melhor do que assumir 1 para
-- todo mundo. O GREATEST(..., 1) e a rede de seguranca: se algum fechamento
-- antigo nao deixou linha de historico, o negocio ainda assim comeca em 1, que
-- e o minimo verdadeiro para quem tem o booleano true. Ou seja: nunca menos que
-- 1, e o valor exato sempre que o historico existir.

UPDATE "Negocio" n
   SET "vezesPerdido" = GREATEST(
         (SELECT COUNT(*) FROM "HistoricoNegocio" h
           WHERE h."negocioId" = n."id" AND h."tipo" = 'PERDA'),
         1
       )
 WHERE n."jaFoiPerdido" = true
   AND n."vezesPerdido" = 0;

UPDATE "Negocio" n
   SET "vezesGanho" = GREATEST(
         (SELECT COUNT(*) FROM "HistoricoNegocio" h
           WHERE h."negocioId" = n."id" AND h."tipo" = 'GANHO'),
         1
       )
 WHERE n."jaFoiGanho" = true
   AND n."vezesGanho" = 0;

-- Bloco 1/5 da fatia "Organizacao do Kanban": MEMORIA DE FECHAMENTO no Negocio.
-- ADITIVO: 6 colunas novas, todas opcionais (ou com default). Nenhum DROP,
-- nenhuma coluna alterada, nenhuma linha removida.
--
-- POR QUE: um lead + finalidade passa a ter no MAXIMO um negocio, REUSADO quando
-- o cliente volta a falar (fim da duplicacao de card). Reabrir limpa
-- motivoPerda/motivoPerdaObs (o negocio esta aberto de novo); sem estas colunas
-- essa informacao so sobreviveria no texto do HistoricoNegocio, e o painel do
-- lead nao teria como exibir o selo "ja foi dado como perdido — motivo X".
--
-- jaFoiPerdido/jaFoiGanho sao HISTORIA, nao estado: uma vez true, nunca voltam.

ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "jaFoiPerdido" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "ultimoMotivoPerda" TEXT;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "ultimoMotivoPerdaObs" TEXT;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "ultimaPerdaEm" TIMESTAMP(3);
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "jaFoiGanho" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "ultimoGanhoEm" TIMESTAMP(3);

-- Backfill RETROATIVO (so preenche as colunas novas; nao toca em nada existente).
-- 1) Quem tem uma PERDA/GANHO no historico ja nasce com a marca — inclusive os
--    negocios que JA foram reabertos antes desta fatia, cujo motivoPerda ja tinha
--    sido limpo. Assim o selo aparece desde o primeiro deploy.
UPDATE "Negocio" n
   SET "jaFoiPerdido" = true
 WHERE n."jaFoiPerdido" = false
   AND EXISTS (
     SELECT 1 FROM "HistoricoNegocio" h
      WHERE h."negocioId" = n."id" AND h."tipo" = 'PERDA'
   );

UPDATE "Negocio" n
   SET "jaFoiGanho" = true
 WHERE n."jaFoiGanho" = false
   AND EXISTS (
     SELECT 1 FROM "HistoricoNegocio" h
      WHERE h."negocioId" = n."id" AND h."tipo" = 'GANHO'
   );

-- 2) Quem esta PERDIDO agora tem o motivo vivo em motivoPerda: copia para a
--    memoria (o selo passa a mostrar o motivo tambem depois de reaberto).
UPDATE "Negocio"
   SET "jaFoiPerdido" = true,
       "ultimoMotivoPerda" = "motivoPerda",
       "ultimoMotivoPerdaObs" = "motivoPerdaObs",
       "ultimaPerdaEm" = COALESCE("fechadoEm", "atualizadoEm")
 WHERE "status" = 'PERDIDO'
   AND "ultimoMotivoPerda" IS NULL;

-- 3) Quem esta GANHO agora: guarda a data do ganho.
UPDATE "Negocio"
   SET "jaFoiGanho" = true,
       "ultimoGanhoEm" = COALESCE("fechadoEm", "atualizadoEm")
 WHERE "status" = 'GANHO'
   AND "ultimoGanhoEm" IS NULL;

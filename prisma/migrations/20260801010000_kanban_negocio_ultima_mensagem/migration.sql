-- Bloco 4 da fatia "Organizacao do Kanban": ultima interacao no nivel do NEGOCIO.
-- ADITIVO: uma coluna opcional + um indice. Nenhum DROP, nada alterado.
--
-- POR QUE: nas colunas terminais (Vendido/Perdido) o dono quer o card que
-- recebeu mensagem recente NO TOPO. A informacao existe em
-- Conversa.ultimaMensagemEm, mas o Prisma nao ordena Negocio por um campo de
-- lista (lead -> conversas), entao o valor e espelhado aqui a cada mensagem
-- (IN e OUT). Tambem e o relogio do arquivamento por prazo (Bloco 3).

ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "ultimaMensagemEm" TIMESTAMP(3);

-- Backfill: traz a ultima mensagem da conversa da MESMA finalidade do negocio
-- (a conversa e unica por lead+finalidade). Sem isto, no primeiro deploy toda
-- coluna terminal ficaria com ultimaMensagemEm NULL e cairia no desempate.
UPDATE "Negocio" n
   SET "ultimaMensagemEm" = c."ultimaMensagemEm"
  FROM "Conversa" c
 WHERE c."leadId" = n."leadId"
   AND c."finalidade" = n."finalidade"
   AND c."ultimaMensagemEm" IS NOT NULL
   AND n."ultimaMensagemEm" IS NULL;

-- Espelha o indice da Fatia Q para o novo ORDER BY das colunas terminais
-- (WHERE etapaId = $1 ORDER BY "ultimaMensagemEm" DESC, id DESC LIMIT 51).
CREATE INDEX IF NOT EXISTS "Negocio_etapa_ultima_msg_idx"
    ON "Negocio" ("etapaId", "ultimaMensagemEm" DESC, "id" DESC);

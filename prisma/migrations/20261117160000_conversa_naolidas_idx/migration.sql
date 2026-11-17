-- FRENTE 1 (lentidao): indice PARCIAL para o contador de nao-lidas.
--
-- /api/conversas/nao-lidas roda COUNT(*) WHERE "arquivada"=false AND
-- "naoLidas">0 (e, para vendedor, AND "agenteId"=...). Nao havia indice em
-- "naoLidas": para admin (sem filtro de agente) virava varredura da tabela
-- inteira a cada chamada — e a Sidebar chamava isso a cada mensagem, por agente
-- (ver o debounce adicionado em Sidebar.tsx). Este indice parcial cobre SO as
-- linhas que interessam (nao arquivadas e com pendencia), entao fica pequeno e
-- o count vira varredura de indice. A coluna "agenteId" no indice resolve tambem
-- o filtro por vendedor sem outra estrutura.
--
-- Prisma nao expressa indice PARCIAL no schema -> vive aqui, como SQL cru (mesmo
-- padrao do unique parcial de Negocio/Conversa). Aditivo e idempotente: zero
-- DROP, zero TEMP TABLE, sem DELETE.
CREATE INDEX IF NOT EXISTS "Conversa_naolidas_parcial_idx"
  ON "Conversa" ("agenteId")
  WHERE "arquivada" = false AND "naoLidas" > 0;

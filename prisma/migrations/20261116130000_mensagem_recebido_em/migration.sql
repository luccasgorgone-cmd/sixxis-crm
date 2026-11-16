-- Latencia de ingestao: coluna `recebidoEm` (instante do INSERT no CRM), para
-- medir recebidoEm - hora (hora = timestamp do WhatsApp). 100% ADITIVO.
--
-- Nullable e SEM default no banco (o app preenche com new Date() no insert):
-- ALTER TABLE ... ADD COLUMN nullable sem default e so-metadado no Postgres
-- (instantaneo, sem reescrever a tabela nem a TOAST do `raw`), seguro no
-- prisma migrate deploy do start no Railway. Zero DROP, zero TEMP TABLE.
ALTER TABLE "Mensagem" ADD COLUMN IF NOT EXISTS "recebidoEm" TIMESTAMP(3);

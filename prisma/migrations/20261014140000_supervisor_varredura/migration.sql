-- Varredura periódica do Supervisor: config própria (ativa/cadência/itens).
-- Aditivo puro, nullable — nenhum DROP, nenhuma tabela temporária, sem backfill.
-- Linha ausente/null é resolvida em código (resolverVarredura) para o default
-- seguro (varredura desligada). Seguro em deploy contínuo (prisma migrate deploy).
ALTER TABLE "SupervisorConfig" ADD COLUMN "varreduraJson" JSONB;

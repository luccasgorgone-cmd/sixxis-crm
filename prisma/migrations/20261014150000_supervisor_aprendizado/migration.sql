-- Aprendizado do Supervisor Comercial IA: snapshot determinístico do loop de
-- feedback (aceitação/sucesso por sinal + insights). ADITIVO: coluna nullable,
-- sem DROP, sem TEMP TABLE, sem backfill — ausência é resolvida no código por
-- resolverAprendizado (default = nunca estudou).
ALTER TABLE "SupervisorConfig" ADD COLUMN "aprendizadoJson" JSONB;

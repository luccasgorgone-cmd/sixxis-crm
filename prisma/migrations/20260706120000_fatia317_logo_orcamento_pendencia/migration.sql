-- Fatia 3.17: logo dedicada do orcamento + motivo estruturado de pendencia.
-- ADITIVO, sem DROP.

-- Logo separada usada SO no PDF de orcamento (independente da logo do sistema).
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN "logoOrcamentoData" TEXT;
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN "logoOrcamentoMime" TEXT;
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN "logoOrcamentoEm" TIMESTAMP(3);

-- Motivo estruturado (CODE) da pendencia; motivoPendencia segue como observacao.
ALTER TABLE "Negocio" ADD COLUMN "motivoPendenciaCode" TEXT;

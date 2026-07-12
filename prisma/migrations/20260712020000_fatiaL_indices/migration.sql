-- Fatia L (Bloco 3): indice ADITIVO para a rota quente de cobranca 1-N.
-- Acelera findFirst({ where: { negocioId }, orderBy: { criadoEm: "desc" } }).
-- Somente CREATE INDEX; nenhuma coluna/tabela alterada.

CREATE INDEX "Pagamento_negocioId_criadoEm_idx" ON "Pagamento"("negocioId", "criadoEm");

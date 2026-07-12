-- Fatia A (Bloco 1): multiplas cobrancas por negocio (1-N).
-- ADITIVO, sem DROP: adiciona o vinculo opcional Pagamento -> Orcamento e seu
-- indice. Nenhuma coluna existente e alterada; externalReference continua UNIQUE.

ALTER TABLE "Pagamento" ADD COLUMN "orcamentoId" TEXT;

CREATE INDEX "Pagamento_orcamentoId_idx" ON "Pagamento"("orcamentoId");

ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_orcamentoId_fkey"
    FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

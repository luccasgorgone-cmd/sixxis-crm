-- Fatia D (Bloco 1): notas fiscais multiplas por cliente.
-- ADITIVO, sem DROP: cria a tabela NotaFiscal (nivel lead, com vinculo opcional a
-- negocio e orcamento) e seus indices/FKs. Nenhuma coluna existente e alterada;
-- Lead.notaFiscal e Negocio.transportadora PERMANECEM no banco.

CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "negocioId" TEXT,
    "orcamentoId" TEXT,
    "numero" TEXT NOT NULL,
    "dataNF" TIMESTAMP(3) NOT NULL,
    "agenteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotaFiscal_leadId_criadoEm_idx" ON "NotaFiscal"("leadId", "criadoEm");
CREATE INDEX "NotaFiscal_orcamentoId_idx" ON "NotaFiscal"("orcamentoId");
CREATE INDEX "NotaFiscal_negocioId_idx" ON "NotaFiscal"("negocioId");

ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_orcamentoId_fkey"
    FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

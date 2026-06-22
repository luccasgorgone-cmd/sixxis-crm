-- Fatia 2.24: orcamentos do cliente. Aditivo.
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "negocioId" TEXT,
    "produto" TEXT NOT NULL,
    "valor" DECIMAL(12,2),
    "voltagem" TEXT,
    "observacao" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Orcamento_leadId_idx" ON "Orcamento"("leadId");

ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fatia 3.07: orcamento-DECISAO com numero de pedido. ADITIVO, sem DROP.
-- 1) Renomeia o antigo Orcamento (cotacao de produto) -> CotacaoProduto,
--    PRESERVANDO todos os dados. So renomeacao (zero DROP).
ALTER TABLE "Orcamento" RENAME TO "CotacaoProduto";
ALTER TABLE "CotacaoProduto" RENAME CONSTRAINT "Orcamento_pkey" TO "CotacaoProduto_pkey";
ALTER INDEX "Orcamento_leadId_idx" RENAME TO "CotacaoProduto_leadId_idx";
ALTER TABLE "CotacaoProduto" RENAME CONSTRAINT "Orcamento_leadId_fkey" TO "CotacaoProduto_leadId_fkey";
ALTER TABLE "CotacaoProduto" RENAME CONSTRAINT "Orcamento_negocioId_fkey" TO "CotacaoProduto_negocioId_fkey";

-- 2) Novo Orcamento (orcamento-decisao) + itens.
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "negocioId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL,
    "decisao" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "totalGarantia" DECIMAL(12,2),
    "agenteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Orcamento_numero_key" ON "Orcamento"("numero");
CREATE INDEX "Orcamento_leadId_criadoEm_idx" ON "Orcamento"("leadId", "criadoEm");
CREATE INDEX "Orcamento_negocioId_idx" ON "Orcamento"("negocioId");
CREATE INDEX "Orcamento_decisao_criadoEm_idx" ON "Orcamento"("decisao", "criadoEm");

ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrcamentoItem" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "produtoCatalogoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "garantia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrcamentoItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrcamentoItem_orcamentoId_idx" ON "OrcamentoItem"("orcamentoId");

ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

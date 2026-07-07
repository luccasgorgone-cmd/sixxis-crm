-- Fatia 3.19: voltagem nas pecas eletricas. ADITIVO, sem DROP.

-- "110V" | "220V" | null (peca sem voltagem, serve em ambas).
ALTER TABLE "ProdutoCatalogo" ADD COLUMN "voltagem" TEXT;

-- Query do pos-venda: pecas de um modelo por voltagem.
CREATE INDEX "ProdutoCatalogo_modelo_voltagem_idx" ON "ProdutoCatalogo"("modelo", "voltagem");

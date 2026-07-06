-- Fatia 3.09 (Bloco 0): chave estavel do produto do site no ProdutoCatalogo,
-- para o lazy-sync loja->catalogo. ADITIVO, sem DROP.
ALTER TABLE "ProdutoCatalogo" ADD COLUMN "chaveLoja" TEXT;
CREATE INDEX "ProdutoCatalogo_chaveLoja_idx" ON "ProdutoCatalogo"("chaveLoja");

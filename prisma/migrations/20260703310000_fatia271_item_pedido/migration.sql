-- Fatia 2.71: itens de pedido (ganho) + frete/valorProdutos no Negocio. ADITIVO.

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "valorProdutos" DECIMAL(12,2),
ADD COLUMN     "frete" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "ItemPedido" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "produtoCatalogoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemPedido_negocioId_idx" ON "ItemPedido"("negocioId");

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

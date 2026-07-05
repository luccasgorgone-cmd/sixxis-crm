-- Fatia 3.06: pecas no atendimento (negocio pos-venda) e na assistencia (Local).
-- ADITIVO, sem DROP.

-- Modelo do aparelho do cliente, marcado no atendimento de pos-venda.
ALTER TABLE "Negocio" ADD COLUMN "modeloProdutoCliente" TEXT;

-- Vinculo opcional da movimentacao de estoque a um item da assistencia (Local).
ALTER TABLE "MovimentacaoPeca" ADD COLUMN "itemLocalId" TEXT;
CREATE INDEX "MovimentacaoPeca_itemLocalId_idx" ON "MovimentacaoPeca"("itemLocalId");

-- Uso/planejamento de peca: NEGOCIO (staging, nao movimenta) ou LOCAL (aplica, baixa).
CREATE TABLE "PecaUso" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "negocioId" TEXT,
    "itemLocalId" TEXT,
    "pecaId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "garantia" BOOLEAN NOT NULL DEFAULT false,
    "agenteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PecaUso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PecaUso_negocioId_idx" ON "PecaUso"("negocioId");
CREATE INDEX "PecaUso_itemLocalId_idx" ON "PecaUso"("itemLocalId");
CREATE INDEX "PecaUso_pecaId_idx" ON "PecaUso"("pecaId");

-- AddForeignKey
ALTER TABLE "PecaUso" ADD CONSTRAINT "PecaUso_pecaId_fkey" FOREIGN KEY ("pecaId") REFERENCES "ProdutoCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

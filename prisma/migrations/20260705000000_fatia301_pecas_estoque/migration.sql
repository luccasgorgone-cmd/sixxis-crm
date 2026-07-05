-- Fatia 3.01: modulo de pecas — estoque em ProdutoCatalogo + MovimentacaoPeca.
-- ADITIVO, sem DROP. Estoque pode ficar negativo (a baixa nunca trava; a UI sinaliza).

-- ProdutoCatalogo: estoque atual + estoque minimo (opcional, para alerta).
ALTER TABLE "ProdutoCatalogo" ADD COLUMN "estoque" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProdutoCatalogo" ADD COLUMN "estoqueMinimo" INTEGER;

-- Movimentacao de estoque (historico imutavel; o tipo da o sinal).
CREATE TABLE "MovimentacaoPeca" (
    "id" TEXT NOT NULL,
    "pecaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "motivo" TEXT,
    "negocioId" TEXT,
    "leadId" TEXT,
    "agenteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoPeca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimentacaoPeca_pecaId_criadoEm_idx" ON "MovimentacaoPeca"("pecaId", "criadoEm");
CREATE INDEX "MovimentacaoPeca_negocioId_idx" ON "MovimentacaoPeca"("negocioId");

-- AddForeignKey
ALTER TABLE "MovimentacaoPeca" ADD CONSTRAINT "MovimentacaoPeca_pecaId_fkey" FOREIGN KEY ("pecaId") REFERENCES "ProdutoCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fatia 2.32 Parte G: produto de interesse (lista gerenciavel + vinculo N:N).
-- Aditivo. Distinto do produto comprado/orcamento.

CREATE TABLE "ProdutoInteresse" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoInteresse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProdutoInteresse_nome_key" ON "ProdutoInteresse" ("nome");

CREATE TABLE "LeadProdutoInteresse" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "produtoInteresseId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadProdutoInteresse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadProdutoInteresse_leadId_produtoInteresseId_key"
    ON "LeadProdutoInteresse" ("leadId", "produtoInteresseId");
CREATE INDEX "LeadProdutoInteresse_produtoInteresseId_idx"
    ON "LeadProdutoInteresse" ("produtoInteresseId");

ALTER TABLE "LeadProdutoInteresse"
    ADD CONSTRAINT "LeadProdutoInteresse_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadProdutoInteresse"
    ADD CONSTRAINT "LeadProdutoInteresse_produtoInteresseId_fkey"
    FOREIGN KEY ("produtoInteresseId") REFERENCES "ProdutoInteresse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

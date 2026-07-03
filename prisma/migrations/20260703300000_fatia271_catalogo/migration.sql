-- Fatia 2.71: catalogo de produtos e pecas para pedidos. ADITIVO, sem DROP.

-- CreateEnum
CREATE TYPE "TipoCatalogo" AS ENUM ('PRODUTO', 'PECA');

-- CreateTable
CREATE TABLE "ProdutoCatalogo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "modelo" TEXT,
    "precoSugerido" DECIMAL(12,2),
    "tipo" "TipoCatalogo" NOT NULL DEFAULT 'PRODUTO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProdutoCatalogo_tipo_ativo_ordem_idx" ON "ProdutoCatalogo"("tipo", "ativo", "ordem");

-- Pre-popula com os produtos conhecidos (climatizadores + aspirador + spinning).
INSERT INTO "ProdutoCatalogo" ("id", "nome", "categoria", "modelo", "tipo", "ordem") VALUES
  ('seed-clima-m45',  'Climatizador M45',   'Climatizadores', 'M45',   'PRODUTO', 1),
  ('seed-clima-sx040','Climatizador SX040', 'Climatizadores', 'SX040', 'PRODUTO', 2),
  ('seed-clima-sx060','Climatizador SX060', 'Climatizadores', 'SX060', 'PRODUTO', 3),
  ('seed-clima-sx070','Climatizador SX070', 'Climatizadores', 'SX070', 'PRODUTO', 4),
  ('seed-clima-sx100','Climatizador SX100', 'Climatizadores', 'SX100', 'PRODUTO', 5),
  ('seed-clima-sx120','Climatizador SX120', 'Climatizadores', 'SX120', 'PRODUTO', 6),
  ('seed-clima-sx180','Climatizador SX180', 'Climatizadores', 'SX180', 'PRODUTO', 7),
  ('seed-clima-sx200','Climatizador SX200', 'Climatizadores', 'SX200', 'PRODUTO', 8),
  ('seed-aspirador',  'Aspirador',          'Aspiradores',    NULL,    'PRODUTO', 9),
  ('seed-spinning',   'Spinning',           'Spinning',       NULL,    'PRODUTO', 10);

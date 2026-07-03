-- Fatia 2.47-C: Rastreio (multiplos codigos) e transporte no negocio. ADITIVO,
-- sem DROP: novas colunas opcionais em Negocio e nova tabela RastreioNegocio.

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "transportadora" TEXT,
ADD COLUMN     "dataEnvio" TIMESTAMP(3),
ADD COLUMN     "previsaoChegada" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RastreioNegocio" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "transportadora" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RastreioNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RastreioNegocio_negocioId_idx" ON "RastreioNegocio"("negocioId");

-- AddForeignKey
ALTER TABLE "RastreioNegocio" ADD CONSTRAINT "RastreioNegocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

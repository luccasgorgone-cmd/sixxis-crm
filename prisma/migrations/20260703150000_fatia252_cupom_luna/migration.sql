-- Fatia 2.52: cupom de primeira compra da Luna. ADITIVO, sem DROP: colunas
-- opcionais em ConfigAgenteIA (cupom, descricao e liga/desliga).

-- AlterTable
ALTER TABLE "ConfigAgenteIA" ADD COLUMN     "cupomPrimeiraCompra" TEXT DEFAULT 'SIXXIS05';
ALTER TABLE "ConfigAgenteIA" ADD COLUMN     "cupomDescricao" TEXT DEFAULT '5% na primeira compra';
ALTER TABLE "ConfigAgenteIA" ADD COLUMN     "cupomAtivo" BOOLEAN NOT NULL DEFAULT true;

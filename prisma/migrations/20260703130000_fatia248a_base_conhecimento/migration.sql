-- Fatia 2.48-A: Base de conhecimento de produtos da Luna. ADITIVO, sem DROP:
-- coluna opcional de texto em ConfigAgenteIA.

-- AlterTable
ALTER TABLE "ConfigAgenteIA" ADD COLUMN     "baseConhecimento" TEXT;

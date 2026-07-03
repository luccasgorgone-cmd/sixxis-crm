-- Fatia 2.69: favoritar figurinhas (favorito global). ADITIVO, sem DROP.

-- AlterTable
ALTER TABLE "FigurinhaSixxis" ADD COLUMN     "favorita" BOOLEAN NOT NULL DEFAULT false;

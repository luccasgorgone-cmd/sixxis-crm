-- Fatia 2.47-B: Segmento comercial do cliente (Varejo/Atacado) no Lead. ADITIVO,
-- sem DROP: cria o enum e adiciona a coluna opcional (null = nao definido).

-- CreateEnum
CREATE TYPE "Segmento" AS ENUM ('VAREJO', 'ATACADO');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "segmento" "Segmento";

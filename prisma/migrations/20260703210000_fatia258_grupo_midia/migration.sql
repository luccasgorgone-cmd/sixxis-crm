-- Fatia 2.58: midia nos grupos internos. ADITIVO, sem DROP: coluna opcional de
-- URL permanente da midia no R2 (mesmo padrao do inbox de clientes).

-- AlterTable
ALTER TABLE "MensagemGrupo" ADD COLUMN     "mediaUrl" TEXT;

-- Fatia 2.48-B: identidade "Luna" nas mensagens. ADITIVO, sem DROP: marca as
-- mensagens enviadas pela IA (viaIA) e o nome de exibicao interno (iaNome).

-- AlterTable
ALTER TABLE "Mensagem" ADD COLUMN     "viaIA" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mensagem" ADD COLUMN     "iaNome" TEXT DEFAULT 'Luna';

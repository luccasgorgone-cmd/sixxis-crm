-- Fatia 2.15c: modelos de mensagem (estende RespostaRapida). Aditivo.

-- AlterTable
ALTER TABLE "RespostaRapida" ADD COLUMN "categoria" TEXT NOT NULL DEFAULT 'atalho',
ADD COLUMN "finalidade" "Finalidade";

-- CreateIndex
CREATE INDEX "RespostaRapida_categoria_idx" ON "RespostaRapida"("categoria");

-- Fatia 2.15a: marcacoes por finalidade + pendencia operacional. Tudo aditivo.

-- AlterEnum: novo tipo de evento na linha do tempo do cliente.
ALTER TYPE "AtividadeTipo" ADD VALUE 'PENDENCIA';

-- AlterTable: etiqueta ganha finalidade (NULL = serve as duas / "Ambas").
ALTER TABLE "Etiqueta" ADD COLUMN "finalidade" "Finalidade";

-- CreateIndex
CREATE INDEX "Etiqueta_finalidade_idx" ON "Etiqueta"("finalidade");

-- AlterTable: pendencia operacional do negocio.
ALTER TABLE "Negocio" ADD COLUMN "pendente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "motivoPendencia" TEXT;

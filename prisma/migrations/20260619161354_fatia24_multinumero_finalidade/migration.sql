-- CreateEnum
CREATE TYPE "Finalidade" AS ENUM ('VENDA', 'POS_VENDA');

-- CreateEnum
CREATE TYPE "FinalidadeEtapa" AS ENUM ('VENDA', 'POS_VENDA', 'AMBAS');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "donoPosVendaId" TEXT;

-- AlterTable
ALTER TABLE "Conversa" ADD COLUMN     "finalidade" "Finalidade" NOT NULL DEFAULT 'VENDA',
ADD COLUMN     "instanciaId" TEXT;

-- AlterTable
ALTER TABLE "Etapa" ADD COLUMN     "finalidade" "FinalidadeEtapa" NOT NULL DEFAULT 'VENDA';

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "finalidade" "Finalidade" NOT NULL DEFAULT 'VENDA';

-- AlterTable
ALTER TABLE "ConfigRoteamento" ADD COLUMN     "ponteiroPosVendaId" TEXT;

-- CreateTable
CREATE TABLE "InstanciaWhatsApp" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "instanciaEvolution" TEXT NOT NULL,
    "numero" TEXT,
    "finalidade" "Finalidade" NOT NULL DEFAULT 'VENDA',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "statusConexao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanciaWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstanciaWhatsApp_instanciaEvolution_key" ON "InstanciaWhatsApp"("instanciaEvolution");

-- CreateIndex
CREATE INDEX "Lead_donoPosVendaId_idx" ON "Lead"("donoPosVendaId");

-- CreateIndex
CREATE INDEX "Conversa_instanciaId_idx" ON "Conversa"("instanciaId");

-- CreateIndex
CREATE INDEX "Conversa_finalidade_idx" ON "Conversa"("finalidade");

-- CreateIndex
CREATE INDEX "Negocio_finalidade_idx" ON "Negocio"("finalidade");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_donoPosVendaId_fkey" FOREIGN KEY ("donoPosVendaId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "InstanciaWhatsApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;


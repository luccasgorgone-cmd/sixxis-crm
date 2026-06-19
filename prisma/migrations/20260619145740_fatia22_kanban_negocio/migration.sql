-- CreateEnum
CREATE TYPE "Temperatura" AS ENUM ('QUENTE', 'MORNO', 'FRIO');

-- CreateEnum
CREATE TYPE "TipoEtapa" AS ENUM ('ABERTA', 'GANHO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "TipoHistorico" AS ENUM ('CRIACAO', 'ETAPA', 'NOTA', 'ETIQUETA', 'ATRIBUICAO', 'VALOR', 'GANHO', 'PERDA');

-- AlterTable
ALTER TABLE "Etapa" ADD COLUMN     "tipo" "TipoEtapa" NOT NULL DEFAULT 'ABERTA';

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "entrouEtapaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechadoEm" TIMESTAMP(3),
ADD COLUMN     "temperatura" "Temperatura" NOT NULL DEFAULT 'MORNO';

-- CreateTable
CREATE TABLE "HistoricoNegocio" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "agenteId" TEXT,
    "tipo" "TipoHistorico" NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoricoNegocio_negocioId_criadoEm_idx" ON "HistoricoNegocio"("negocioId", "criadoEm");

-- CreateIndex
CREATE INDEX "Negocio_agenteId_idx" ON "Negocio"("agenteId");

-- AddForeignKey
ALTER TABLE "HistoricoNegocio" ADD CONSTRAINT "HistoricoNegocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoNegocio" ADD CONSTRAINT "HistoricoNegocio_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;


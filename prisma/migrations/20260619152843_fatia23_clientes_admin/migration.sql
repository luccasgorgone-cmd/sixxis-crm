-- CreateEnum
CREATE TYPE "EstrategiaRoteamento" AS ENUM ('ROUND_ROBIN');

-- CreateEnum
CREATE TYPE "AtividadeTipo" AS ENUM ('CONTATO', 'ATRIBUICAO', 'TRANSFERENCIA', 'ASSUMIDO', 'NOTA', 'ETIQUETA', 'ETAPA', 'VALOR', 'GANHO', 'PERDA', 'CRIACAO');

-- AlterTable
ALTER TABLE "Agente" ADD COLUMN     "telefone" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "donoId" TEXT;

-- CreateTable
CREATE TABLE "ObservacaoPreset" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservacaoPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigRoteamento" (
    "id" TEXT NOT NULL,
    "estrategia" "EstrategiaRoteamento" NOT NULL DEFAULT 'ROUND_ROBIN',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "respeitarDono" BOOLEAN NOT NULL DEFAULT true,
    "ponteiroAgenteId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigRoteamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Atividade" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "negocioId" TEXT,
    "agenteId" TEXT,
    "tipo" "AtividadeTipo" NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Atividade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Atividade_leadId_criadoEm_idx" ON "Atividade"("leadId", "criadoEm");

-- CreateIndex
CREATE INDEX "Lead_donoId_idx" ON "Lead"("donoId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;


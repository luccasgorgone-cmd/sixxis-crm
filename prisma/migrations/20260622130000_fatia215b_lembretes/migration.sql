-- Fatia 2.15b: lembretes/agendamento de contato. Aditivo.

-- AlterEnum
ALTER TYPE "AtividadeTipo" ADD VALUE 'LEMBRETE';

-- CreateEnum
CREATE TYPE "StatusLembrete" AS ENUM ('PENDENTE', 'FEITO', 'CANCELADO');

-- CreateTable
CREATE TABLE "Lembrete" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "negocioId" TEXT,
    "agenteId" TEXT NOT NULL,
    "finalidade" "Finalidade" NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "nota" TEXT,
    "status" "StatusLembrete" NOT NULL DEFAULT 'PENDENTE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "Lembrete_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lembrete_agenteId_status_dataHora_idx" ON "Lembrete"("agenteId", "status", "dataHora");

-- CreateIndex
CREATE INDEX "Lembrete_leadId_idx" ON "Lembrete"("leadId");

-- AddForeignKey
ALTER TABLE "Lembrete" ADD CONSTRAINT "Lembrete_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lembrete" ADD CONSTRAINT "Lembrete_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lembrete" ADD CONSTRAINT "Lembrete_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

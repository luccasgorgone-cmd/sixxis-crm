-- Fatia 2.30 Parte G: agenda (Tarefa) + alertas antecipados. Aditivo.

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('PENDENTE', 'CONCLUIDA', 'CANCELADA');

-- AlterTable (alerta antecipado dos lembretes)
ALTER TABLE "Lembrete" ADD COLUMN "lembrarAntesMin" INTEGER;
ALTER TABLE "Lembrete" ADD COLUMN "notificadoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Tarefa" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "duracaoMin" INTEGER,
    "leadId" TEXT,
    "lembrarAntesMin" INTEGER,
    "notificadoEm" TIMESTAMP(3),
    "status" "StatusTarefa" NOT NULL DEFAULT 'PENDENTE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tarefa_agenteId_dataHora_idx" ON "Tarefa"("agenteId", "dataHora");

-- CreateIndex
CREATE INDEX "Tarefa_leadId_idx" ON "Tarefa"("leadId");

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

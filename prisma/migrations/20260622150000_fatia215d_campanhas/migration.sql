-- Fatia 2.15d: envio em massa multicanal. Aditivo.

-- CreateEnum
CREATE TYPE "CanalEnvio" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "StatusCampanha" AS ENUM ('RASCUNHO', 'ENVIANDO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusDestino" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHA', 'PULADO');

-- AlterTable (opt-out de comunicacoes em massa)
ALTER TABLE "Lead" ADD COLUMN "aceitaContato" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Campanha" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "finalidade" "Finalidade" NOT NULL,
    "canal" "CanalEnvio" NOT NULL,
    "modeloId" TEXT,
    "assunto" TEXT,
    "mensagem" TEXT NOT NULL,
    "valoresJson" JSONB,
    "filtroJson" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "pulados" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusCampanha" NOT NULL DEFAULT 'RASCUNHO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "Campanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampanhaDestino" (
    "id" TEXT NOT NULL,
    "campanhaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "status" "StatusDestino" NOT NULL DEFAULT 'PENDENTE',
    "erro" TEXT,
    "enviadoEm" TIMESTAMP(3),

    CONSTRAINT "CampanhaDestino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campanha_agenteId_criadoEm_idx" ON "Campanha"("agenteId", "criadoEm");

-- CreateIndex
CREATE INDEX "Campanha_status_idx" ON "Campanha"("status");

-- CreateIndex
CREATE INDEX "CampanhaDestino_campanhaId_status_idx" ON "CampanhaDestino"("campanhaId", "status");

-- CreateIndex
CREATE INDEX "CampanhaDestino_leadId_idx" ON "CampanhaDestino"("leadId");

-- AddForeignKey
ALTER TABLE "Campanha" ADD CONSTRAINT "Campanha_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampanhaDestino" ADD CONSTRAINT "CampanhaDestino_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampanhaDestino" ADD CONSTRAINT "CampanhaDestino_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

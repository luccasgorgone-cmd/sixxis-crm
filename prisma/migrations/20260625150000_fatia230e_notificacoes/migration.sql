-- Fatia 2.30 Parte E: centro de notificacoes do agente. Aditivo.

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "link" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "leadId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacao_agenteId_lida_criadoEm_idx" ON "Notificacao"("agenteId", "lida", "criadoEm");

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fatia 2.62: registro e historico de chamadas de WhatsApp recebidas. ADITIVO,
-- sem DROP. So registra o evento CALL (a Evolution nao transmite audio). Nao
-- entra em metricas de venda.

-- CreateTable
CREATE TABLE "Chamada" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "leadId" TEXT,
    "telefone" TEXT NOT NULL,
    "direcao" TEXT NOT NULL DEFAULT 'recebida',
    "tipo" TEXT NOT NULL DEFAULT 'voz',
    "status" TEXT NOT NULL DEFAULT 'perdida',
    "instancia" TEXT NOT NULL,
    "instanciaId" TEXT,
    "finalidade" "Finalidade" NOT NULL DEFAULT 'VENDA',
    "agenteId" TEXT,
    "visto" BOOLEAN NOT NULL DEFAULT false,
    "horaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chamada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chamada_externalId_key" ON "Chamada"("externalId");

-- CreateIndex
CREATE INDEX "Chamada_agenteId_horaEm_idx" ON "Chamada"("agenteId", "horaEm");

-- CreateIndex
CREATE INDEX "Chamada_instanciaId_horaEm_idx" ON "Chamada"("instanciaId", "horaEm");

-- CreateIndex
CREATE INDEX "Chamada_finalidade_horaEm_idx" ON "Chamada"("finalidade", "horaEm");

-- CreateIndex
CREATE INDEX "Chamada_visto_status_idx" ON "Chamada"("visto", "status");

-- AddForeignKey
ALTER TABLE "Chamada" ADD CONSTRAINT "Chamada_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamada" ADD CONSTRAINT "Chamada_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

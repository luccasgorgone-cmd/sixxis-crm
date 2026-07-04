-- Fatia 2.98: telemetria da Sol. ADITIVO (so CREATE; zero DROP).
CREATE TABLE "SolEvento" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "motivo" TEXT,
    "modelo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SolEvento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SolEvento_criadoEm_idx" ON "SolEvento"("criadoEm");
CREATE INDEX "SolEvento_conversaId_idx" ON "SolEvento"("conversaId");

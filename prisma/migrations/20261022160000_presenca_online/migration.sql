-- Presenca ONLINE do vendedor: estado 'online' (separado de 'ativo' da conta) +
-- periodos de presenca (base da metrica por tempo-online e do roteamento).
-- ADITIVO: ADD COLUMN nullable/com default + CREATE TABLE. Sem DROP/TEMP.
ALTER TABLE "Agente" ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PresencaPeriodo" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresencaPeriodo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PresencaPeriodo_agenteId_inicioEm_idx" ON "PresencaPeriodo"("agenteId", "inicioEm");

ALTER TABLE "PresencaPeriodo" ADD CONSTRAINT "PresencaPeriodo_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

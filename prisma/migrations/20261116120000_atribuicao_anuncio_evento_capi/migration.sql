-- Atribuicao de anuncio (Click-to-WhatsApp) congelada no fechamento + log CAPI.
-- 100% ADITIVO: so ADD COLUMN / CREATE TABLE idempotentes. Zero DROP, zero
-- alteracao de coluna existente, zero TEMP TABLE. Seguro pro prisma migrate
-- deploy do start no Railway.

-- 1) Campos de atribuicao de anuncio no Negocio (todos nullable, forward-only).
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "anuncioIdAtribuido" TEXT;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "anuncioTituloAtribuido" TEXT;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "anuncioUrlAtribuido" TEXT;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "ctwaClidAtribuido" TEXT;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "atribuicaoAnuncioEm" TIMESTAMP(3);

-- 2) Tabela de log dos eventos Purchase do Meta CAPI (auditoria/dedupe).
CREATE TABLE IF NOT EXISTS "EventoCapi" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT,
    "eventName" TEXT NOT NULL DEFAULT 'Purchase',
    "eventId" TEXT NOT NULL,
    "actionSource" TEXT NOT NULL DEFAULT 'business_messaging',
    "valor" DECIMAL(12,2),
    "moeda" TEXT,
    "ctwaClid" TEXT,
    "anuncioId" TEXT,
    "pulado" BOOLEAN NOT NULL DEFAULT false,
    "motivoPulo" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoCapi_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventoCapi_negocioId_idx" ON "EventoCapi"("negocioId");
CREATE INDEX IF NOT EXISTS "EventoCapi_eventId_idx" ON "EventoCapi"("eventId");
CREATE INDEX IF NOT EXISTS "EventoCapi_criadoEm_idx" ON "EventoCapi"("criadoEm");

-- FK com ON DELETE SET NULL: log sobrevive a remocao do negocio. Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventoCapi_negocioId_fkey'
  ) THEN
    ALTER TABLE "EventoCapi"
      ADD CONSTRAINT "EventoCapi_negocioId_fkey"
      FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

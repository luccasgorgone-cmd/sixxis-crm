-- F3 omnichannel (SCOPING_HIBRIDO_4701_CLOUD_CALLING): provider por conta de
-- WhatsApp + identidade do cliente por canal.
--
-- ADITIVO, sem DROP, sem TEMP TABLE (regra de deploy do CRM). As linhas
-- existentes de InstanciaWhatsApp recebem provider=EVOLUTION pelo DEFAULT — o
-- comportamento atual (Evolution) fica 100% intocado. No cutover de um numero,
-- a MESMA linha vira provider=CLOUD_API e ganha phoneNumberId/wabaId, preservando
-- as conversas/mensagens ja ligadas por instanciaId (nenhuma linha nova).

-- Enum do provider de canal.
CREATE TYPE "ProviderCanal" AS ENUM ('EVOLUTION', 'CLOUD_API', 'SANDBOX');

-- Colunas novas em InstanciaWhatsApp (default/nullable => nao quebra linhas
-- existentes; provider assume EVOLUTION).
ALTER TABLE "InstanciaWhatsApp"
    ADD COLUMN "provider" "ProviderCanal" NOT NULL DEFAULT 'EVOLUTION',
    ADD COLUMN "phoneNumberId" TEXT,
    ADD COLUMN "wabaId" TEXT,
    ADD COLUMN "credencialRef" TEXT;

-- Tabela nova: identidade do cliente por canal (LID/BSUID/telefone -> Lead).
CREATE TABLE "IdentidadeCanal" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" "ProviderCanal" NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentidadeCanal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentidadeCanal_provider_tipo_valor_key" ON "IdentidadeCanal"("provider", "tipo", "valor");
CREATE INDEX "IdentidadeCanal_leadId_idx" ON "IdentidadeCanal"("leadId");

ALTER TABLE "IdentidadeCanal" ADD CONSTRAINT "IdentidadeCanal_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

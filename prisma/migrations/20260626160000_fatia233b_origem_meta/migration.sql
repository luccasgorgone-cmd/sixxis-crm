-- Fatia 2.33 Parte B: origem por anuncio (Click-to-WhatsApp) + Meta CAPI. Aditivo.

-- Origem por anuncio no Lead.
ALTER TABLE "Lead" ADD COLUMN "anuncioId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "anuncioTitulo" TEXT;
ALTER TABLE "Lead" ADD COLUMN "anuncioUrl" TEXT;
ALTER TABLE "Lead" ADD COLUMN "origemDetalhe" TEXT;

-- Configuracao do Meta Conversions API (singleton ConfiguracaoCRM).
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN "metaPixelId" TEXT;
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN "metaCapiToken" TEXT;
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN "metaTestEventCode" TEXT;

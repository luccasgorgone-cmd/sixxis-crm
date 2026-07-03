-- Fatia 2.49: Favicon do CRM (PNG) guardado no banco. ADITIVO, sem DROP.

-- AlterTable
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN     "faviconData" TEXT,
ADD COLUMN     "faviconMime" TEXT,
ADD COLUMN     "faviconEm" TIMESTAMP(3);

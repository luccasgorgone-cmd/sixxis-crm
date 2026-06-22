-- AlterTable (aditiva, sem DROP): logo da empresa guardada no banco.
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN     "logoData" TEXT,
ADD COLUMN     "logoMime" TEXT,
ADD COLUMN     "logoEm" TIMESTAMP(3);

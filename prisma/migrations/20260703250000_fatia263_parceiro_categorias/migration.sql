-- Fatia 2.63: categorias de produto atendidas pelo parceiro. ADITIVO, sem DROP.
-- Lista JSON (ex.: ["climatizadores","aspiradores","spinning"]).

-- AlterTable
ALTER TABLE "Parceiro" ADD COLUMN     "categorias" JSONB;

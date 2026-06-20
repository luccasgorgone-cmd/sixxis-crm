-- AlterEnum
ALTER TYPE "AtividadeTipo" ADD VALUE 'EDICAO';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "pushName" TEXT,
ADD COLUMN     "nomeManual" TEXT,
ADD COLUMN     "fotoUrl" TEXT,
ADD COLUMN     "fotoAtualizadaEm" TIMESTAMP(3),
ADD COLUMN     "empresa" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "anotacoes" TEXT;

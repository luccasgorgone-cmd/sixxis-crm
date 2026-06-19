-- CreateEnum
CREATE TYPE "AtendidoPor" AS ENUM ('HUMANO', 'IA');

-- CreateEnum
CREATE TYPE "StatusEnvio" AS ENUM ('ENVIANDO', 'ENVIADA', 'ENTREGUE', 'ERRO');

-- AlterTable
ALTER TABLE "Agente" ADD COLUMN     "senha" TEXT,
ADD COLUMN     "ultimoLogin" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Conversa" ADD COLUMN     "agenteId" TEXT,
ADD COLUMN     "arquivada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "atendidoPor" "AtendidoPor" NOT NULL DEFAULT 'HUMANO',
ADD COLUMN     "naoLidas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimaMensagemEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Mensagem" ADD COLUMN     "lida" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "statusEnvio" "StatusEnvio";

-- CreateIndex
CREATE INDEX "Conversa_agenteId_idx" ON "Conversa"("agenteId");

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;


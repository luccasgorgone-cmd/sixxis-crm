-- AlterTable
ALTER TABLE "Agente" ADD COLUMN     "acessoPosVenda" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acessoVenda" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "papel" SET DEFAULT 'COLABORADOR';

-- CreateIndex
CREATE INDEX "Conversa_agenteId_ultimaMensagemEm_idx" ON "Conversa"("agenteId", "ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "Mensagem_conversaId_direcao_idx" ON "Mensagem"("conversaId", "direcao");

-- CreateIndex
CREATE INDEX "Negocio_agenteId_status_fechadoEm_idx" ON "Negocio"("agenteId", "status", "fechadoEm");

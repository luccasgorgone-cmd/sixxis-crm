-- Fatia 2.69: reacoes (emoji) nas mensagens. ADITIVO, sem DROP.
-- reacao = a nossa (atendente); reacaoDeCliente = a do cliente.

-- AlterTable
ALTER TABLE "Mensagem" ADD COLUMN     "reacao" TEXT,
ADD COLUMN     "reacaoDeCliente" TEXT;

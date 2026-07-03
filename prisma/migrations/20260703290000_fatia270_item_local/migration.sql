-- Fatia 2.70: aba Local (produtos em assistencia, pos-venda). ADITIVO, sem DROP.

-- CreateEnum
CREATE TYPE "StatusAssistencia" AS ENUM ('RECEBIDO', 'EM_ANALISE', 'EM_REPARO', 'AGUARDANDO_PECA', 'PRONTO', 'ENTREGUE');

-- CreateTable
CREATE TABLE "ItemLocal" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "descricaoProduto" TEXT NOT NULL,
    "modelo" TEXT,
    "categoria" TEXT,
    "numeroSerie" TEXT,
    "defeitoRelatado" TEXT,
    "status" "StatusAssistencia" NOT NULL DEFAULT 'RECEBIDO',
    "localizacao" TEXT,
    "tecnicoResponsavel" TEXT,
    "observacoes" TEXT,
    "dataEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSaida" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemLocal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemLocal_status_dataEntrada_idx" ON "ItemLocal"("status", "dataEntrada");

-- CreateIndex
CREATE INDEX "ItemLocal_dataEntrada_idx" ON "ItemLocal"("dataEntrada");

-- AddForeignKey
ALTER TABLE "ItemLocal" ADD CONSTRAINT "ItemLocal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

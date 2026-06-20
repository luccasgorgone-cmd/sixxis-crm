-- CreateEnum
CREATE TYPE "MetricaMeta" AS ENUM ('VALOR_VENDIDO', 'QTD_GANHOS', 'CONVERSAO', 'CLIENTES_ATENDIDOS', 'TEMPO_RESPOSTA', 'TEMPO_RESOLUCAO');

-- CreateEnum
CREATE TYPE "EscopoMeta" AS ENUM ('COLABORADOR', 'EQUIPE');

-- CreateEnum
CREATE TYPE "PeriodoMeta" AS ENUM ('DIARIA', 'SEMANAL', 'MENSAL', 'CUSTOM');

-- CreateTable
CREATE TABLE "Meta" (
    "id" TEXT NOT NULL,
    "nome" TEXT,
    "escopo" "EscopoMeta" NOT NULL,
    "agenteId" TEXT,
    "finalidade" "FinalidadeEtapa" NOT NULL DEFAULT 'AMBAS',
    "metrica" "MetricaMeta" NOT NULL,
    "alvo" DOUBLE PRECISION NOT NULL,
    "periodo" "PeriodoMeta" NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meta_agenteId_ativo_idx" ON "Meta"("agenteId", "ativo");

-- AddForeignKey
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

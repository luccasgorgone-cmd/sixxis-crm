-- Fatia 2.29 Parte D: empresa faturada (lista gerenciavel) + nota fiscal. Aditivo.
CREATE TABLE "EmpresaFaturada" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmpresaFaturada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmpresaFaturada_nome_key" ON "EmpresaFaturada"("nome");

ALTER TABLE "Lead" ADD COLUMN "notaFiscal" TEXT;
ALTER TABLE "Lead" ADD COLUMN "empresaFaturadaId" TEXT;

CREATE INDEX "Lead_empresaFaturadaId_idx" ON "Lead"("empresaFaturadaId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_empresaFaturadaId_fkey" FOREIGN KEY ("empresaFaturadaId") REFERENCES "EmpresaFaturada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Novo tipo de atividade para auditar acompanhamento (NF, empresa, garantia).
ALTER TYPE "AtividadeTipo" ADD VALUE IF NOT EXISTS 'ACOMPANHAMENTO';

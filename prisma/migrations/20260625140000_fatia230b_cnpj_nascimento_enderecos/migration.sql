-- Fatia 2.30 Parte B: CNPJ, data de nascimento e enderecos (multiplos). Aditivo.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "cnpj" TEXT;
ALTER TABLE "Lead" ADD COLUMN "dataNascimento" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Endereco" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "apelido" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Endereco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Endereco_leadId_idx" ON "Endereco"("leadId");

-- AddForeignKey
ALTER TABLE "Endereco" ADD CONSTRAINT "Endereco_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

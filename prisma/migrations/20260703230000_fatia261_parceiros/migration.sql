-- Fatia 2.61: parceiros (tecnicos) — ferramenta de pos-venda. ADITIVO, sem DROP.
-- Entidade PROPRIA, isolada: sem relacao com Lead/Negocio/Cliente, fora do funil.

-- CreateTable
CREATE TABLE "Parceiro" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "regiao" TEXT,
    "email" TEXT,
    "especialidade" TEXT,
    "observacoes" TEXT,
    "fretePadrao" DECIMAL(12,2),
    "freteObs" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Parceiro_ativo_uf_idx" ON "Parceiro"("ativo", "uf");

-- CreateIndex
CREATE INDEX "Parceiro_regiao_idx" ON "Parceiro"("regiao");

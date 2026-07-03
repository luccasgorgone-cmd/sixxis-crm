-- Fatia 2.66: figurinhas (stickers) predefinidas da Sixxis. ADITIVO, sem DROP.

-- CreateTable
CREATE TABLE "FigurinhaSixxis" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FigurinhaSixxis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FigurinhaSixxis_ativo_ordem_idx" ON "FigurinhaSixxis"("ativo", "ordem");

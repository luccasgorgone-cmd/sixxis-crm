-- Fatia 2.40: cache persistente do clima por UF/periodo (Inteligencia Regional).
-- Aditivo, sem DROP: apenas CREATE TABLE + indice unico (uf, dias).

-- CreateTable
CREATE TABLE "ClimaCacheUF" (
    "id" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "dias" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClimaCacheUF_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClimaCacheUF_uf_dias_key" ON "ClimaCacheUF"("uf", "dias");

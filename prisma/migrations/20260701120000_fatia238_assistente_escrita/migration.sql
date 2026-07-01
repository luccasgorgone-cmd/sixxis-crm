-- Fatia 2.38: Assistente de escrita (varinha magica no compositor). Aditivo,
-- sem DROP: apenas CREATE TABLE.

-- CreateTable
CREATE TABLE "AssistenteTom" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "instrucao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistenteTom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistenteConfig" (
    "id" TEXT NOT NULL,
    "modelo" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistenteConfig_pkey" PRIMARY KEY ("id")
);

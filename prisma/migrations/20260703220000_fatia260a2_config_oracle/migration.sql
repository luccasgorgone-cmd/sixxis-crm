-- Fatia 2.60-A2: config editavel do Oracle. ADITIVO, sem DROP. Singleton com
-- modelo, orientacoes extras e base de conhecimento (as travas ficam no codigo).

-- CreateTable
CREATE TABLE "ConfigOracle" (
    "id" TEXT NOT NULL,
    "modelo" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "promptSistema" TEXT,
    "baseConhecimento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigOracle_pkey" PRIMARY KEY ("id")
);

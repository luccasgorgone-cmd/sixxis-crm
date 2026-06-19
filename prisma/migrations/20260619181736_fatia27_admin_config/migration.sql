-- CreateTable
CREATE TABLE "RespostaRapida" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "atalho" TEXT,
    "texto" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RespostaRapida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoCRM" (
    "id" TEXT NOT NULL,
    "nomeEmpresa" TEXT,
    "fuso" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "horarios" JSONB,
    "mensagemForaHorario" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoCRM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigAgenteIA" (
    "id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "modelo" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    "promptSistema" TEXT,
    "responderForaHorario" BOOLEAN NOT NULL DEFAULT false,
    "responderLeadNovo" BOOLEAN NOT NULL DEFAULT false,
    "handoffPalavras" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigAgenteIA_pkey" PRIMARY KEY ("id")
);


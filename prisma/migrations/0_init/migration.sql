-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('VENDEDOR', 'POS_VENDA', 'ADMIN');

-- CreateEnum
CREATE TYPE "DirecaoMsg" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "TipoMsg" AS ENUM ('TEXTO', 'AUDIO', 'IMAGEM', 'VIDEO', 'DOCUMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusNeg" AS ENUM ('ABERTO', 'GANHO', 'PERDIDO');

-- CreateTable
CREATE TABLE "Agente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'VENDEDOR',
    "avatarUrl" TEXT,
    "metaMensal" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "nome" TEXT,
    "telefone" TEXT NOT NULL,
    "email" TEXT,
    "origem" TEXT,
    "ctwaClid" TEXT,
    "clienteSiteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "instancia" TEXT NOT NULL DEFAULT 'sixxis-wa1',
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "direcao" "DirecaoMsg" NOT NULL,
    "tipo" "TipoMsg" NOT NULL DEFAULT 'TEXTO',
    "conteudo" TEXT,
    "transcricao" TEXT,
    "mediaUrl" TEXT,
    "raw" JSONB NOT NULL,
    "hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etapa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#3cbfb3',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Etapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etiqueta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#3cbfb3',

    CONSTRAINT "Etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEtiqueta" (
    "leadId" TEXT NOT NULL,
    "etiquetaId" TEXT NOT NULL,

    CONSTRAINT "LeadEtiqueta_pkey" PRIMARY KEY ("leadId","etiquetaId")
);

-- CreateTable
CREATE TABLE "Negocio" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agenteId" TEXT,
    "etapaId" TEXT,
    "valor" DECIMAL(12,2),
    "produtos" JSONB,
    "status" "StatusNeg" NOT NULL DEFAULT 'ABERTO',
    "motivoPerda" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agenteId" TEXT,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agente_email_key" ON "Agente"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_telefone_key" ON "Lead"("telefone");

-- CreateIndex
CREATE INDEX "Conversa_leadId_idx" ON "Conversa"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Mensagem_externalId_key" ON "Mensagem"("externalId");

-- CreateIndex
CREATE INDEX "Mensagem_conversaId_hora_idx" ON "Mensagem"("conversaId", "hora");

-- CreateIndex
CREATE INDEX "Negocio_etapaId_status_idx" ON "Negocio"("etapaId", "status");

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEtiqueta" ADD CONSTRAINT "LeadEtiqueta_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEtiqueta" ADD CONSTRAINT "LeadEtiqueta_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "Etiqueta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

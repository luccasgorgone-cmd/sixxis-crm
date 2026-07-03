-- Fatia 2.55: chat interno de grupos (@g.us). ADITIVO, sem DROP. Estrutura
-- ISOLADA: nenhuma relacao com Lead/Negocio/Conversa; nao entra no funil/metricas.

-- CreateTable
CREATE TABLE "GrupoInterno" (
    "id" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "nome" TEXT,
    "fotoUrl" TEXT,
    "instancia" TEXT NOT NULL,
    "arquivado" BOOLEAN NOT NULL DEFAULT false,
    "ultimaMensagemEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoInterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensagemGrupo" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "autorJid" TEXT,
    "autorNome" TEXT,
    "direcao" "DirecaoMsg" NOT NULL,
    "conteudo" TEXT,
    "tipo" "TipoMsg" NOT NULL DEFAULT 'TEXTO',
    "hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrupoInterno_jid_key" ON "GrupoInterno"("jid");

-- CreateIndex
CREATE INDEX "GrupoInterno_arquivado_ultimaMensagemEm_idx" ON "GrupoInterno"("arquivado", "ultimaMensagemEm");

-- CreateIndex
CREATE UNIQUE INDEX "MensagemGrupo_externalId_key" ON "MensagemGrupo"("externalId");

-- CreateIndex
CREATE INDEX "MensagemGrupo_grupoId_hora_idx" ON "MensagemGrupo"("grupoId", "hora");

-- AddForeignKey
ALTER TABLE "MensagemGrupo" ADD CONSTRAINT "MensagemGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoInterno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

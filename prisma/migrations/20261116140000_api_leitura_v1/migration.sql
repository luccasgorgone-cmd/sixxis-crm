-- API de Leitura v1 (read-only externa). 100% ADITIVO: duas tabelas novas,
-- desacopladas do dominio (sem FK), e quatro indices de watermark/cursor para
-- paginacao estavel e sync incremental. Zero DROP, zero TEMP TABLE, sem CTE.
-- Os CREATE INDEX sao nao-concorrentes (rodam dentro da transacao do
-- migrate deploy) e constroem UMA vez; em Mensagem (tabela maior) o build
-- share-lock escritas brevemente — custo unico aceitavel no start do deploy.

-- CreateTable: chave de API read-only (guarda SO o hash SHA-256, nunca a chave).
CREATE TABLE IF NOT EXISTS "ApiChaveLeitura" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "escopos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "ultimoUsoEm" TIMESTAMP(3),
    "ultimoIp" TEXT,

    CONSTRAINT "ApiChaveLeitura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ApiChaveLeitura_hash_key" ON "ApiChaveLeitura"("hash");
CREATE INDEX IF NOT EXISTS "ApiChaveLeitura_prefixo_idx" ON "ApiChaveLeitura"("prefixo");
CREATE INDEX IF NOT EXISTS "ApiChaveLeitura_revogadoEm_idx" ON "ApiChaveLeitura"("revogadoEm");

-- CreateTable: log de auditoria por requisicao (NUNCA guarda chave nem PII).
CREATE TABLE IF NOT EXISTS "ApiLogAcesso" (
    "id" TEXT NOT NULL,
    "chaveId" TEXT,
    "prefixo" TEXT,
    "metodo" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "query" TEXT,
    "status" INTEGER NOT NULL,
    "duracaoMs" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiLogAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApiLogAcesso_chaveId_criadoEm_idx" ON "ApiLogAcesso"("chaveId", "criadoEm");
CREATE INDEX IF NOT EXISTS "ApiLogAcesso_rota_criadoEm_idx" ON "ApiLogAcesso"("rota", "criadoEm");
CREATE INDEX IF NOT EXISTS "ApiLogAcesso_criadoEm_idx" ON "ApiLogAcesso"("criadoEm");

-- CreateIndex: watermarks de sync/cursor da API v1 (aditivos, nos models de dominio).
CREATE INDEX IF NOT EXISTS "Negocio_atualizadoEm_id_idx" ON "Negocio"("atualizadoEm", "id");
CREATE INDEX IF NOT EXISTS "Lead_criadoEm_id_idx" ON "Lead"("criadoEm", "id");
CREATE INDEX IF NOT EXISTS "Conversa_criadoEm_id_idx" ON "Conversa"("criadoEm", "id");
CREATE INDEX IF NOT EXISTS "Mensagem_hora_id_idx" ON "Mensagem"("hora", "id");

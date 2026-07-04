-- Fatia 2.93: conversas persistentes e comandos salvos do Oracle. ADITIVO (so
-- CREATE/ALTER ADD; zero DROP). Relacoes com Agente com ON DELETE RESTRICT (sem
-- cascade destrutivo).

CREATE TABLE "OracleConversa" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OracleConversa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OracleMensagem" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OracleMensagem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OracleComando" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OracleComando_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OracleConversa_agenteId_arquivada_atualizadoEm_idx" ON "OracleConversa"("agenteId", "arquivada", "atualizadoEm");
CREATE INDEX "OracleMensagem_conversaId_criadoEm_idx" ON "OracleMensagem"("conversaId", "criadoEm");
CREATE INDEX "OracleComando_agenteId_criadoEm_idx" ON "OracleComando"("agenteId", "criadoEm");

ALTER TABLE "OracleConversa" ADD CONSTRAINT "OracleConversa_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OracleMensagem" ADD CONSTRAINT "OracleMensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "OracleConversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OracleComando" ADD CONSTRAINT "OracleComando_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

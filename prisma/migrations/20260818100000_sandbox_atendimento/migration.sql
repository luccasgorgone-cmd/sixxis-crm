-- Sandbox de atendimento (WORKORDER_ATENDIMENTO_OMNICHANNEL, pedido direto do
-- Luccas em 18/08/2026, aprovado via `main`).
--
-- ADITIVO, sem DROP: cria 4 tabelas NOVAS, prefixo "Sandbox", ZERO foreign key
-- para Lead/Negocio/Conversa/Mensagem/Etapa/ConfigAgenteIA (a tabela real do
-- atendimento). Isolamento por CONSTRUCAO: nao existe caminho no SQL para uma
-- linha de sandbox referenciar ou ser referenciada por uma linha real.
--
-- SandboxNegocio.finalidade reusa a mesma semantica textual de
-- Conversa.finalidade/Negocio.finalidade ("VENDA"/"POS_VENDA"), mas como TEXT
-- solto (nao FK no enum Finalidade real) para o sandbox nunca depender de uma
-- tabela/enum de producao. SandboxMensagem.direcao reusa o enum DirecaoMsg
-- (IN/OUT) ja existente — e so um enum de valores, sem FK, seguro reusar.

CREATE TABLE "SandboxLead" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "roteiro" TEXT,
    "roteiroPasso" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SandboxNegocio" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "etapa" TEXT NOT NULL DEFAULT 'NOVO',
    "finalidade" TEXT NOT NULL DEFAULT 'VENDA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxNegocio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SandboxMensagem" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "direcao" "DirecaoMsg" NOT NULL,
    "texto" TEXT NOT NULL,
    "acao" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxMensagem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SandboxConfig" (
    "id" TEXT NOT NULL,
    "promptSistemaExtra" TEXT,
    "provider" TEXT,
    "modelo" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SandboxNegocio_leadId_idx" ON "SandboxNegocio"("leadId");
CREATE INDEX "SandboxNegocio_etapa_idx" ON "SandboxNegocio"("etapa");
CREATE INDEX "SandboxMensagem_negocioId_criadoEm_idx" ON "SandboxMensagem"("negocioId", "criadoEm");

-- FKs SOMENTE entre tabelas Sandbox* (auto-contidas, isoladas do resto do banco).
ALTER TABLE "SandboxNegocio" ADD CONSTRAINT "SandboxNegocio_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "SandboxLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SandboxMensagem" ADD CONSTRAINT "SandboxMensagem_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "SandboxNegocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

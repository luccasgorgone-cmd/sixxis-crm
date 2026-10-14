-- Supervisor Comercial IA (SPEC_SUPERVISOR_COMERCIAL_IA.md, V1 — aba admin-only).
--
-- ADITIVO, sem DROP, sem TEMP TABLE (regra de deploy do CRM): cria 1 enum + 2
-- tabelas NOVAS (prefixo "Supervisor"), ZERO alteracao em tabela existente, ZERO
-- foreign key. Segue o padrao de SolEvento (tabela de auditoria/evento): adminId
-- / negocioId / leadId sao ids SOLTOS, nao referencias — um log de acao nunca
-- deve ser apagado em cascata com o negocio que ele audita. Isolamento por
-- construcao: nada em producao referencia estas tabelas nem e referenciado por
-- elas. Custo da IA reusa SolEvento (acao "supervisor_*"), sem coluna nova.

-- Ciclo de vida da acao proposta pela IA do supervisor.
CREATE TYPE "StatusSupervisorAcao" AS ENUM ('PROPOSTO', 'EXECUTADO', 'DESCARTADO', 'REVERTIDO', 'FALHOU');

-- Config singleton do supervisor (provider/modelo da IA + limiares/metas JSON).
CREATE TABLE "SupervisorConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "modelo" TEXT,
    "limiaresJson" JSONB,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupervisorConfig_pkey" PRIMARY KEY ("id")
);

-- Auditoria + undo de cada acao de escrita Nivel 1 (human-in-the-loop).
CREATE TABLE "SupervisorAcao" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "ferramenta" TEXT NOT NULL,
    "argsJson" JSONB NOT NULL,
    "preview" TEXT NOT NULL,
    "status" "StatusSupervisorAcao" NOT NULL DEFAULT 'PROPOSTO',
    "antesJson" JSONB,
    "depoisJson" JSONB,
    "negocioId" TEXT,
    "leadId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executadoEm" TIMESTAMP(3),

    CONSTRAINT "SupervisorAcao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupervisorAcao_status_idx" ON "SupervisorAcao"("status");
CREATE INDEX "SupervisorAcao_criadoEm_idx" ON "SupervisorAcao"("criadoEm");

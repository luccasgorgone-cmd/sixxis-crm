-- Prospeccao Ativa Fase 2 (Manual). ADITIVO: enum + tabela side (1:1 Lead) + flag.
-- Sem DROP/TEMP. prospeccaoAtiva nasce false (dry-run/no-op).
CREATE TYPE "FaseProspeccao" AS ENUM ('ABORDAGEM', 'QUALIFICACAO', 'PROPOSTA', 'FECHAMENTO', 'NUTRICAO', 'QUALIFICADO', 'ENCERRADO');

ALTER TABLE "ConfiguracaoCRM" ADD COLUMN     "prospeccaoAtiva" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProspeccaoContato" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agenteId" TEXT,
    "fase" "FaseProspeccao" NOT NULL DEFAULT 'ABORDAGEM',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "canais" JSONB,
    "primeiroContatoEm" TIMESTAMP(3),
    "proximaAcaoEm" TIMESTAMP(3),
    "nutricaoAte" TIMESTAMP(3),
    "encerradoMotivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProspeccaoContato_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProspeccaoContato_leadId_key" ON "ProspeccaoContato"("leadId");
CREATE INDEX "ProspeccaoContato_fase_idx" ON "ProspeccaoContato"("fase");
CREATE INDEX "ProspeccaoContato_agenteId_idx" ON "ProspeccaoContato"("agenteId");
CREATE INDEX "ProspeccaoContato_nutricaoAte_idx" ON "ProspeccaoContato"("nutricaoAte");

ALTER TABLE "ProspeccaoContato" ADD CONSTRAINT "ProspeccaoContato_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspeccaoContato" ADD CONSTRAINT "ProspeccaoContato_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Carteira de Leads (prospeccao B2B por lista importada).
-- ADITIVO: dois enums novos e tres tabelas novas. Nenhum DROP, nenhuma tabela
-- ou coluna existente alterada, nenhum dado tocado. Idempotente (IF NOT EXISTS /
-- duplicate_object) para sobreviver a reaplicacao.
--
-- Nada dispara por esta migracao: CarteiraContato nasce status=NOVO e so vira
-- Lead/Negocio/Conversa quando o VENDEDOR ativa pela UI. Nenhuma mensagem e
-- enviada. A trava de deduplicacao e o UNIQUE("telefone") — e o banco, nao o
-- codigo, que garante "um contato por numero" mesmo em reimportacao/corrida.

DO $$ BEGIN
  CREATE TYPE "CarteiraCategoria" AS ENUM ('REVENDA', 'VAREJO', 'LOCACAO', 'OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CarteiraStatusContato" AS ENUM ('NOVO', 'EM_ABORDAGEM', 'RESPONDEU', 'CONVERTIDO', 'DESCARTADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CarteiraLote" (
  "id"             TEXT NOT NULL,
  "nome"           TEXT NOT NULL,
  "origem"         TEXT,
  "totalImportado" INTEGER NOT NULL DEFAULT 0,
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CarteiraLote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CarteiraContato" (
  "id"               TEXT NOT NULL,
  "loteId"           TEXT,
  "telefone"         TEXT NOT NULL,
  "nome"             TEXT NOT NULL,
  "uf"               TEXT,
  "cidade"           TEXT,
  "bairro"           TEXT,
  "endereco"         TEXT,
  "categoria"        "CarteiraCategoria" NOT NULL DEFAULT 'OUTRO',
  "segmento"         TEXT,
  "notaGoogle"       DOUBLE PRECISION,
  "numAvaliacoes"    INTEGER,
  "score"            INTEGER,
  "classe"           TEXT,
  "curvaCidade"      TEXT,
  "emailPublico"     TEXT,
  "linkFonte"        TEXT,
  "perfilObs"        TEXT,
  "donoId"           TEXT,
  "status"           "CarteiraStatusContato" NOT NULL DEFAULT 'NOVO',
  "leadId"           TEXT,
  "conversaId"       TEXT,
  "ativadoEm"        TIMESTAMP(3),
  "descartadoMotivo" TEXT,
  "criadoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CarteiraContato_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CarteiraAtividade" (
  "id"        TEXT NOT NULL,
  "contatoId" TEXT NOT NULL,
  "agenteId"  TEXT,
  "tipo"      TEXT NOT NULL,
  "detalhe"   TEXT,
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CarteiraAtividade_pkey" PRIMARY KEY ("id")
);

-- Unicidade (dedup duro) e indices.
CREATE UNIQUE INDEX IF NOT EXISTS "CarteiraContato_telefone_key" ON "CarteiraContato"("telefone");
CREATE UNIQUE INDEX IF NOT EXISTS "CarteiraContato_leadId_key"   ON "CarteiraContato"("leadId");
CREATE INDEX IF NOT EXISTS "CarteiraContato_donoId_status_idx"   ON "CarteiraContato"("donoId", "status");
CREATE INDEX IF NOT EXISTS "CarteiraContato_uf_categoria_idx"    ON "CarteiraContato"("uf", "categoria");
CREATE INDEX IF NOT EXISTS "CarteiraContato_status_idx"          ON "CarteiraContato"("status");
CREATE INDEX IF NOT EXISTS "CarteiraAtividade_agenteId_criadoEm_idx" ON "CarteiraAtividade"("agenteId", "criadoEm");
CREATE INDEX IF NOT EXISTS "CarteiraAtividade_contatoId_idx"        ON "CarteiraAtividade"("contatoId");
CREATE INDEX IF NOT EXISTS "CarteiraAtividade_tipo_criadoEm_idx"    ON "CarteiraAtividade"("tipo", "criadoEm");

-- FKs (aditivas; onDelete casando com o schema). Guardadas por checagem de
-- existencia para idempotencia.
DO $$ BEGIN
  ALTER TABLE "CarteiraContato" ADD CONSTRAINT "CarteiraContato_loteId_fkey"
    FOREIGN KEY ("loteId") REFERENCES "CarteiraLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CarteiraContato" ADD CONSTRAINT "CarteiraContato_donoId_fkey"
    FOREIGN KEY ("donoId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CarteiraContato" ADD CONSTRAINT "CarteiraContato_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CarteiraAtividade" ADD CONSTRAINT "CarteiraAtividade_contatoId_fkey"
    FOREIGN KEY ("contatoId") REFERENCES "CarteiraContato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CarteiraAtividade" ADD CONSTRAINT "CarteiraAtividade_agenteId_fkey"
    FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

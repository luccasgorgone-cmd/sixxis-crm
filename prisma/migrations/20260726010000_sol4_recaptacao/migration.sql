-- SOL-4: recaptacao em ondas controladas.
-- ADITIVO: dois enums novos e duas tabelas novas. Nenhum DROP, nenhuma tabela
-- ou coluna existente alterada, nenhum dado tocado.
--
-- NADA DISPARA POR ESTA MIGRACAO. CampanhaRecaptacao nasce em RASCUNHO e o motor
-- so envia com status ARMADA — que so o dono seta, pelo painel. Um deploy que
-- aplique esta migracao nao manda mensagem nenhuma.
--
-- A trava central esta no UNIQUE (campanhaId, leadId) de RecaptacaoEnvio: e o
-- banco, e nao o codigo, que garante "nunca reenviar ao mesmo lead" — mesmo se o
-- motor rodar duas vezes em paralelo, a segunda insercao e recusada.

DO $$ BEGIN
  CREATE TYPE "StatusCampanhaRecap" AS ENUM ('RASCUNHO', 'ARMADA', 'PAUSADA', 'CONCLUIDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusRecapEnvio" AS ENUM ('PENDENTE', 'ENVIADO', 'RESPONDIDO', 'OPTOUT', 'ERRO', 'PULADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CampanhaRecaptacao" (
  "id"               TEXT NOT NULL,
  "nome"             TEXT NOT NULL,
  "mensagemTemplate" TEXT NOT NULL,
  "status"           "StatusCampanhaRecap" NOT NULL DEFAULT 'RASCUNHO',
  -- Comeca baixo de proposito: descobrir o limite seguro, nao adivinhar.
  "limiteDiario"     INTEGER NOT NULL DEFAULT 20,
  "enviadosHoje"     INTEGER NOT NULL DEFAULT 0,
  "dataContadorDia"  DATE,
  "pausadaMotivo"    TEXT,
  "pausadaEm"        TIMESTAMP(3),
  "criadoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampanhaRecaptacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecaptacaoEnvio" (
  "id"           TEXT NOT NULL,
  "campanhaId"   TEXT NOT NULL,
  "leadId"       TEXT NOT NULL,
  "conversaId"   TEXT,
  "instancia"    TEXT,
  "status"       "StatusRecapEnvio" NOT NULL DEFAULT 'PENDENTE',
  "erro"         TEXT,
  "enviadoEm"    TIMESTAMP(3),
  "respondidoEm" TIMESTAMP(3),
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecaptacaoEnvio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CampanhaRecaptacao_status_idx"
  ON "CampanhaRecaptacao" ("status");

-- A TRAVA: um lead entra no maximo uma vez por onda.
CREATE UNIQUE INDEX IF NOT EXISTS "RecaptacaoEnvio_campanhaId_leadId_key"
  ON "RecaptacaoEnvio" ("campanhaId", "leadId");

-- Varredura do motor: proximos PENDENTE da onda.
CREATE INDEX IF NOT EXISTS "RecaptacaoEnvio_campanhaId_status_idx"
  ON "RecaptacaoEnvio" ("campanhaId", "status");
-- "este lead ja recebeu recaptacao?" — em QUALQUER onda.
CREATE INDEX IF NOT EXISTS "RecaptacaoEnvio_leadId_status_idx"
  ON "RecaptacaoEnvio" ("leadId", "status");
CREATE INDEX IF NOT EXISTS "RecaptacaoEnvio_enviadoEm_idx"
  ON "RecaptacaoEnvio" ("enviadoEm");

DO $$ BEGIN
  ALTER TABLE "RecaptacaoEnvio"
    ADD CONSTRAINT "RecaptacaoEnvio_campanhaId_fkey"
    FOREIGN KEY ("campanhaId") REFERENCES "CampanhaRecaptacao"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RecaptacaoEnvio"
    ADD CONSTRAINT "RecaptacaoEnvio_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fatia 2.33 Parte A: alertas de SLA por (finalidade, etapa). Aditivo.
-- Separado do sistema de alertas antecipados da agenda (lib/alertas.ts).

CREATE TABLE "ConfigAlertaSla" (
    "id" TEXT NOT NULL,
    "finalidade" "Finalidade" NOT NULL,
    "etapaId" TEXT NOT NULL,
    "minutosParaAlerta" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "som" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigAlertaSla_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfigAlertaSla_finalidade_etapaId_key"
    ON "ConfigAlertaSla" ("finalidade", "etapaId");

CREATE TABLE "AlertaNegocio" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidoEm" TIMESTAMP(3),

    CONSTRAINT "AlertaNegocio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlertaNegocio_negocioId_resolvidoEm_idx"
    ON "AlertaNegocio" ("negocioId", "resolvidoEm");

ALTER TABLE "ConfigAlertaSla"
    ADD CONSTRAINT "ConfigAlertaSla_etapaId_fkey"
    FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlertaNegocio"
    ADD CONSTRAINT "AlertaNegocio_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertaNegocio"
    ADD CONSTRAINT "AlertaNegocio_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "ConfigAlertaSla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

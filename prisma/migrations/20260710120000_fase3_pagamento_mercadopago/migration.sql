-- Fase 3 (Bloco 1): cobranca de pagamento (link Mercado Pago) do orcamento.
-- ADITIVO, sem DROP: cria a tabela Pagamento e seus indices/FK. Nenhuma tabela
-- existente e alterada (a relacao no Negocio e so no nivel Prisma).

CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "mpPreferenceId" TEXT,
    "mpPaymentId" TEXT,
    "externalReference" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "initPoint" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "pagoEm" TIMESTAMP(3),

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pagamento_externalReference_key" ON "Pagamento"("externalReference");
CREATE INDEX "Pagamento_negocioId_idx" ON "Pagamento"("negocioId");
CREATE INDEX "Pagamento_externalReference_idx" ON "Pagamento"("externalReference");

ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

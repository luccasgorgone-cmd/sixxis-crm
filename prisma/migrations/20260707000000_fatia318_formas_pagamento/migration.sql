-- Fatia 3.18 (Bloco 1): formas de pagamento no orcamento. ADITIVO, sem DROP.
-- JSONB nullable: array de { metodo, valor, parcelas } (ver lib/pagamento).

-- Rascunho VIVO no negocio (editavel; congela no snapshot na decisao/GANHO).
ALTER TABLE "Negocio" ADD COLUMN "orcPagamentos" JSONB;

-- Snapshot imutavel no orcamento (congelado na decisao).
ALTER TABLE "Orcamento" ADD COLUMN "pagamentos" JSONB;

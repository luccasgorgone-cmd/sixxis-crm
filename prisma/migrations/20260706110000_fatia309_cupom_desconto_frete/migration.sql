-- Fatia 3.09 (Bloco 1): cupom/desconto/frete no orcamento. ADITIVO, sem DROP.

-- Rascunho vivo no negocio (viram snapshot na decisao).
ALTER TABLE "Negocio" ADD COLUMN "orcCupom" TEXT;
ALTER TABLE "Negocio" ADD COLUMN "orcDescontoPct" DECIMAL(5,2);
ALTER TABLE "Negocio" ADD COLUMN "orcFrete" DECIMAL(12,2);
ALTER TABLE "Negocio" ADD COLUMN "orcFretePagoPelaEmpresa" BOOLEAN NOT NULL DEFAULT false;

-- Snapshot imutavel no orcamento.
ALTER TABLE "Orcamento" ADD COLUMN "cupom" TEXT;
ALTER TABLE "Orcamento" ADD COLUMN "descontoPct" DECIMAL(5,2);
ALTER TABLE "Orcamento" ADD COLUMN "frete" DECIMAL(12,2);
ALTER TABLE "Orcamento" ADD COLUMN "fretePagoPelaEmpresa" BOOLEAN NOT NULL DEFAULT false;
-- totalFinal e NOT NULL: adiciona com default 0, backfilla os existentes com o
-- total bruto (nao havia desconto/frete antes) e remove o default (o app sempre
-- calcula e envia). DROP DEFAULT nao apaga dados.
ALTER TABLE "Orcamento" ADD COLUMN "totalFinal" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "Orcamento" SET "totalFinal" = "total";
ALTER TABLE "Orcamento" ALTER COLUMN "totalFinal" DROP DEFAULT;

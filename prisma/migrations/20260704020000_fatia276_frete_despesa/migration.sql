-- Fatia 2.76 (BLOCO C): frete pago pela empresa vira DESPESA rastreavel.
-- ADITIVO, sem DROP. fretePagoPelaEmpresa marca que o frete e despesa da empresa
-- (fora do total cobrado do cliente); freteDespesa guarda esse valor.

ALTER TABLE "Negocio" ADD COLUMN "fretePagoPelaEmpresa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Negocio" ADD COLUMN "freteDespesa" DECIMAL(12,2);

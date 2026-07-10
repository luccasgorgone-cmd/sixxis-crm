-- Fase 2 (Bloco 1): transportadora escolhida no frete do orcamento. ADITIVO, sem DROP.
-- Nome da transportadora vindo da cotacao da Loja (ex.: "Braspress", "Melhor Envio").

-- Rascunho VIVO no negocio (editavel; congela no snapshot na decisao/GANHO).
ALTER TABLE "Negocio" ADD COLUMN "orcFreteTransportadora" TEXT;

-- Snapshot imutavel no orcamento (congelado na decisao).
ALTER TABLE "Orcamento" ADD COLUMN "freteTransportadora" TEXT;

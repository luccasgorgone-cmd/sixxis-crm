-- Fatia 3.02: garantia por item de pedido + valor final ajustado no negocio.
-- ADITIVO, sem DROP.

-- Item em garantia: nao soma no total cobrado (mas a peca sai do estoque).
ALTER TABLE "ItemPedido" ADD COLUMN "garantia" BOOLEAN NOT NULL DEFAULT false;

-- Valor final realmente cobrado quando houve desconto/acrescimo (null = calculado).
ALTER TABLE "Negocio" ADD COLUMN "valorAjustado" DECIMAL(12,2);

-- Cor do produto do catalogo. ADITIVO: uma coluna opcional. Nenhum DROP, nada
-- alterado, sem default (registros existentes ficam NULL = "sem cor definida").
--
-- POR QUE: a Loja manda voltagem e cor por item do pedido. `voltagem` ja existe
-- em ProdutoCatalogo (nasceu para peca eletrica, serve igual para produto);
-- `cor` faltava. Com a coluna, a tela de Ganho consegue pre-preencher a cor
-- quando o item vem do catalogo, em vez de o vendedor redigitar.

ALTER TABLE "ProdutoCatalogo" ADD COLUMN IF NOT EXISTS "cor" TEXT;

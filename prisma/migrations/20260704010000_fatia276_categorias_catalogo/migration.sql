-- Fatia 2.76 (BLOCO B): padroniza as categorias do catalogo (ProdutoCatalogo)
-- com as categorias CANONICAS da Sol (classificar-produto.ts): Climatizador,
-- Bike Spinning, Aspirador. Apenas UPDATE de dados (sem DROP, sem TEMP TABLE).
-- Variantes antigas ("Climatizadores", "spinning", "Aspiradores"...) sao mapeadas.

UPDATE "ProdutoCatalogo"
SET "categoria" = 'Climatizador'
WHERE "categoria" IS NOT NULL
  AND "categoria" <> 'Climatizador'
  AND (lower("categoria") LIKE '%climatiz%' OR lower("categoria") LIKE '%clima%');

UPDATE "ProdutoCatalogo"
SET "categoria" = 'Bike Spinning'
WHERE "categoria" IS NOT NULL
  AND "categoria" <> 'Bike Spinning'
  AND (
    lower("categoria") LIKE '%spinning%'
    OR lower("categoria") LIKE '%bike%'
    OR lower("categoria") LIKE '%ergometr%'
  );

UPDATE "ProdutoCatalogo"
SET "categoria" = 'Aspirador'
WHERE "categoria" IS NOT NULL
  AND "categoria" <> 'Aspirador'
  AND lower("categoria") LIKE '%aspira%';

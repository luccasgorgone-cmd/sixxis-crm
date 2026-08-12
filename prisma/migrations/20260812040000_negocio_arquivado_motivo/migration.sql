-- Fatia 10 (Bloco 1) — ORIGEM do arquivamento do negocio.
--
-- ADITIVO: uma coluna nova, nullable, sem default. Nenhum DROP, nenhuma linha
-- alterada, nenhum comportamento existente muda por causa dela.
--
-- POR QUE EXISTE: ate aqui "sair do quadro" tinha uma origem so (o job de
-- prazo). A Fatia 10 traz o ENCERRAMENTO MANUAL — o vendedor tira da tela um
-- card que nao e venda nem perda. Os dois viram arquivado=true, entao sem esta
-- coluna o dono nao teria como separar um do outro depois.
--
-- Valores usados pelo codigo: 'PRAZO' | 'MANUAL' (ver src/lib/arquivamento.ts).
-- Fica como TEXT e nao como enum de propria vontade: mesma escolha ja feita em
-- motivoPerda, e evita uma migracao de tipo caso apareca uma terceira origem.
--
-- RETROATIVO: os negocios ja arquivados continuam NULL. Nao da para adivinhar a
-- origem deles, e inventar 'PRAZO' para todos seria gravar um dado que ninguem
-- verificou. NULL diz a verdade: origem desconhecida, anterior a esta fatia.

ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "arquivadoMotivo" TEXT;

-- FRENTE 6 (backfill de estado): na Carteira de Leads "o cliente que ja
-- respondeu nao aparece" e "o sem interesse ja marcado nao aparece".
--
-- Causa raiz ja corrigida no codigo (src/lib/carteira/sync.ts): nada escrevia
-- RESPONDEU/DESCARTADO/CONVERTIDO automaticamente. Agora dois gatilhos escrevem:
--   * mensagem de ENTRADA do prospect        -> RESPONDEU
--   * negocio fechado GANHO (comprou)         -> CONVERTIDO
--   * negocio fechado PERDIDO (sem interesse) -> DESCARTADO
-- Mas os gatilhos so valem para eventos FUTUROS. Os contatos que JA responderam,
-- JA compraram ou JA foram perdidos continuariam presos em NOVO/EM_ABORDAGEM ate
-- o proximo evento, e os filtros "Respondeu/Convertido/Descartado" seguiriam
-- vazios para o historico. Este backfill reconstroi o estado atual a partir dos
-- fatos ja gravados, UMA vez.
--
-- Ordem de rank (identica ao RANK/deveAvancarStatusCarteira em sync.ts):
--   NOVO(0) < EM_ABORDAGEM(1) < RESPONDEU(2) < DESCARTADO(3) < CONVERTIDO(4)
-- Aplicado em rank crescente e sempre com guarda "so avanca" -> o status final
-- de cada contato e o MAIOR fato aplicavel (o sinal de compra sobrepoe o de
-- perda). Idempotente: reexecutar nao muda nada. Aditivo: zero DROP, zero TEMP
-- TABLE, sem DELETE.

-- 1) RESPONDEU: o lead do contato tem >= 1 mensagem de ENTRADA (o prospect
--    respondeu). So sobe quem ainda esta em NOVO/EM_ABORDAGEM.
UPDATE "CarteiraContato" AS c
   SET "status" = 'RESPONDEU'::"CarteiraStatusContato"
 WHERE c."status" IN ('NOVO', 'EM_ABORDAGEM')
   AND c."leadId" IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM "Conversa" cv
       JOIN "Mensagem" m ON m."conversaId" = cv."id"
      WHERE cv."leadId" = c."leadId"
        AND m."direcao" = 'IN'
   );

-- 2) DESCARTADO: o lead tem >= 1 negocio PERDIDO "de verdade" (sem interesse).
--    EXCLUI os perdedores neutralizados pela deduplicacao automatica (frente 7,
--    migracao 20261117140000): aqueles NAO sao "sem interesse", sao duplicatas
--    arquivadas — marca-los DESCARTADO esconderia um lead que ainda esta ativo.
--    So sobe quem esta abaixo de DESCARTADO (NOVO/EM_ABORDAGEM/RESPONDEU).
UPDATE "CarteiraContato" AS c
   SET "status" = 'DESCARTADO'::"CarteiraStatusContato"
 WHERE c."status" IN ('NOVO', 'EM_ABORDAGEM', 'RESPONDEU')
   AND c."leadId" IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM "Negocio" n
      WHERE n."leadId" = c."leadId"
        AND n."status" = 'PERDIDO'
        AND coalesce(n."motivoPerdaObs", '') <> 'Duplicado corrigido automaticamente'
   );

-- 3) CONVERTIDO (apex): o lead tem >= 1 negocio GANHO (comprou). Sobe qualquer
--    status abaixo do apex — o sinal de compra e o mais forte e sobrepoe ate um
--    DESCARTADO setado no passo 2.
UPDATE "CarteiraContato" AS c
   SET "status" = 'CONVERTIDO'::"CarteiraStatusContato"
 WHERE c."status" <> 'CONVERTIDO'
   AND c."leadId" IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM "Negocio" n
      WHERE n."leadId" = c."leadId"
        AND n."status" = 'GANHO'
   );

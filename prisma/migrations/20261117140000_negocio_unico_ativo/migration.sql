-- FRENTE 7 (pedido direto do Luccas): a DUPLICACAO de card entre vendedores
-- ainda acontecia. Causa-raiz confirmada em producao (2026-11-17): o indice
-- UNICO PARCIAL que trava "no maximo UM negocio ATIVO por (leadId, finalidade)"
-- NUNCA foi aplicado (vivia so em prisma/manual/, aplicavel A MAO — e nunca o
-- foi). Sem ele, o catch de P2002 em garantirNegocioParaLead nunca dispara, e
-- duas chamadas quase simultaneas para o mesmo lead+finalidade (ingestao de
-- mensagem + cadastro/Conversar, ou dois eventos da Evolution) passam as duas
-- pelo findFirst e criam DOIS negocios. Amostra real: 3 grupos POS_VENDA, dois
-- deles com cards criados no MESMO milissegundo. Quando o card orfao (agenteId
-- null) e depois roteado por round-robin para outro vendedor, nasce o par "um
-- card com cada vendedor" relatado.
--
-- Esta migracao faz, de uma vez e automaticamente no deploy, o que o par
-- manual (POST /api/admin/corrigir-duplicados -> aplicar indice a mao) fazia:
--   1) NEUTRALIZA os duplicados ativos existentes, com a MESMA regra de escolha
--      do mantido de /api/admin/corrigir-duplicados (a venda que aconteceu
--      manda): GANHO > ABERTO > PERDIDO; empate -> maior valor (sem valor por
--      ultimo) -> atualizadoEm mais recente -> criadoEm -> id. O mantido fica
--      intocado; os demais viram PERDIDO + motivo "duplicado" + arquivado.
--   2) Cria a TRAVA (indice unico parcial). A partir daqui o banco recusa o 2o
--      ativo e o catch de P2002 ja existente REUSA o vencedor em vez de estourar.
--
-- ZERO DELETE, ZERO DROP, ZERO TEMP TABLE: so um UPDATE via CTE e um CREATE
-- INDEX. Historico, pedidos, pagamentos e mensagens do duplicado continuam no
-- banco, ligados a ele — exatamente como a rota admin ja fazia. IDEMPOTENTE:
-- depois do 1o deploy nao sobra grupo (rn>1 nao acha nada) e o indice tem
-- IF NOT EXISTS.
--
-- SEGURANCA DE FATURAMENTO (ponto de atencao nº1): o mantido NUNCA e um negocio
-- de status pior que o duplicado. Como GANHO tem o menor peso, um GANHO jamais
-- e neutralizado em favor de um ABERTO/PERDIDO — a venda real nao vira perdida.
-- So perde para outro GANHO de maior valor (que e, por definicao, a MESMA venda
-- contada em dobro — a dobra que esta correcao existe para tirar).

-- 1) Neutraliza os duplicados ativos (mantem exatamente um por leadId+finalidade).
WITH ranqueados AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "leadId", "finalidade"
      ORDER BY
        CASE "status"
          WHEN 'GANHO'  THEN 0
          WHEN 'ABERTO' THEN 1
          ELSE 2
        END ASC,
        "valor" DESC NULLS LAST,
        "atualizadoEm" DESC,
        "criadoEm" DESC,
        "id" ASC
    ) AS rn
  FROM "Negocio"
  WHERE "arquivado" = false
)
UPDATE "Negocio" AS n
   SET "status"         = 'PERDIDO'::"StatusNeg",
       "motivoPerda"    = 'CONTATO_ERRADO',
       "motivoPerdaObs" = 'Duplicado corrigido automaticamente',
       "arquivado"      = true,
       "arquivadoEm"    = now()
  FROM ranqueados AS r
 WHERE n."id" = r."id"
   AND r.rn > 1;

-- 2) A TRAVA: no maximo UM negocio ativo por (leadId, finalidade). Indice
--    PARCIAL (WHERE arquivado = false) — o historico de negocios ARQUIVADOS
--    duplicados continua livre. Sem CONCURRENTLY: tabela pequena, roda em ms, e
--    CONCURRENTLY nao roda dentro da transacao da migracao.
CREATE UNIQUE INDEX IF NOT EXISTS "Negocio_leadId_finalidade_ativo_key"
  ON "Negocio" ("leadId", "finalidade")
  WHERE "arquivado" = false;

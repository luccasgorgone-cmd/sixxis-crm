-- Renomeia as 3 etapas intermediarias do funil de VENDA: "1"/"2"/"3" passam a
-- "FollowUp - 1"/"FollowUp - 2"/"FollowUp - 3" (grafia exata, com " - ").
--
-- SO UPDATE de nome. Nenhum DROP, nenhum DELETE, nenhuma linha criada. Ordem,
-- cor, tipo e id ficam intocados — e o etapaId dos negocios nao e tocado, entao
-- nenhum card muda de etapa.
--
-- Criterio de alvo: nome antigo + finalidade='VENDA' + tipo='ABERTA'. O funil de
-- pos-venda nao tem etapas "1"/"2"/"3" (so Aberto, Em atendimento, Aguardando
-- cliente, Resolvido, Encerrado sem solucao), e o AND finalidade='VENDA' e a
-- garantia de que ele nao e alcancado.
--
-- IDEMPOTENTE: rodar de novo nao encontra mais nome='1'/'2'/'3' na VENDA e nao
-- altera nada (0 linhas).

UPDATE "Etapa" SET "nome" = 'FollowUp - 1'
 WHERE "nome" = '1'
   AND "finalidade" = 'VENDA'::"FinalidadeEtapa"
   AND "tipo" = 'ABERTA'::"TipoEtapa";

UPDATE "Etapa" SET "nome" = 'FollowUp - 2'
 WHERE "nome" = '2'
   AND "finalidade" = 'VENDA'::"FinalidadeEtapa"
   AND "tipo" = 'ABERTA'::"TipoEtapa";

UPDATE "Etapa" SET "nome" = 'FollowUp - 3'
 WHERE "nome" = '3'
   AND "finalidade" = 'VENDA'::"FinalidadeEtapa"
   AND "tipo" = 'ABERTA'::"TipoEtapa";

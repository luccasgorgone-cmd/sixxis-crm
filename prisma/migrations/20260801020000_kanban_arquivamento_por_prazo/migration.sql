-- Bloco 3 da fatia "Organizacao do Kanban": esvaziar o quadro por PRAZO.
-- ADITIVO: 2 colunas no Negocio, 3 na ConfiguracaoCRM e 1 indice. Nenhum DROP,
-- nenhuma linha removida — "sair do Kanban" e ARQUIVAR, nunca apagar.
--
-- Recurso OPT-IN em duas travas, para nada sumir do quadro sem o dono mandar:
--   1) diasArquivarPerdido / diasArquivarGanho nascem NULL = desligado;
--   2) arquivamentoAtivo nasce false = o job roda em MODO LOG (so conta).

ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "arquivado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "arquivadoEm" TIMESTAMP(3);

ALTER TABLE "ConfiguracaoCRM" ADD COLUMN IF NOT EXISTS "diasArquivarPerdido" INTEGER;
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN IF NOT EXISTS "diasArquivarGanho" INTEGER;
ALTER TABLE "ConfiguracaoCRM" ADD COLUMN IF NOT EXISTS "arquivamentoAtivo" BOOLEAN NOT NULL DEFAULT false;

-- Varredura do job diario (status + arquivado + relogio da ultima interacao).
CREATE INDEX IF NOT EXISTS "Negocio_arquivamento_idx"
    ON "Negocio" ("status", "arquivado", "ultimaMensagemEm");

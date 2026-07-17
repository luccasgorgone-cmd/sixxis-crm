-- Fatia Y: fixar conversa (pin) + marcar como nao lida manualmente.
-- ADITIVO, sem DROP. Duas colunas novas na Conversa e um indice para ordenar
-- as fixadas primeiro.
--   marcadaNaoLida: marcacao MANUAL de nao-lida (independente do contador
--     naoLidas, que e automatico da ingestao). Abrir a conversa zera ambos.
--   fixadaEm: null = nao fixada; data = quando foi fixada (topo da lista).

ALTER TABLE "Conversa" ADD COLUMN "marcadaNaoLida" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversa" ADD COLUMN "fixadaEm" TIMESTAMP(3);

CREATE INDEX "Conversa_fixadaEm_idx" ON "Conversa"("fixadaEm");

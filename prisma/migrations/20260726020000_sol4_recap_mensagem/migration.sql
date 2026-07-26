-- SOL-4 B5: liga o envio de recaptacao a bolha que foi para o cliente.
-- ADITIVO: uma coluna opcional + um indice. Nenhum DROP, nada alterado.
--
-- POR QUE: o painel precisa mostrar "entregues/lidas", e o ack (ENTREGUE/LIDA)
-- vive em Mensagem.statusEnvio. Sem esta ligacao a unica forma de casar os dois
-- seria adivinhar por conversa + horario aproximado — daria um numero
-- plausivel e errado. Com a coluna, o numero e um JOIN, ou nao existe.
--
-- Queda de ack em massa e um dos primeiros sinais de numero sendo limitado pela
-- Meta, entao vale ter o dado de verdade.
--
-- Sem FK de propriedade: a mensagem e do inbox e nao deve ser apagada em
-- cascata por causa de uma campanha; a coluna guarda so a referencia.

ALTER TABLE "RecaptacaoEnvio" ADD COLUMN IF NOT EXISTS "mensagemId" TEXT;

CREATE INDEX IF NOT EXISTS "RecaptacaoEnvio_mensagemId_idx"
  ON "RecaptacaoEnvio" ("mensagemId");

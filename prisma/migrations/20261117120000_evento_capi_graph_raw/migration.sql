-- Medicao do Meta CAPI: persistir a resposta da Graph no caminho de envio real.
-- Aditivo e nullable (zero-DROP): events_received + fbtrace_id p/ conferencia no
-- Events Manager; graphRaw guarda o JSON cru (inclui messages[] de validacao).
ALTER TABLE "EventoCapi" ADD COLUMN "eventsReceived" INTEGER;
ALTER TABLE "EventoCapi" ADD COLUMN "fbtraceId" TEXT;
ALTER TABLE "EventoCapi" ADD COLUMN "graphRaw" TEXT;

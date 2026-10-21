-- Captura do gclid do Google Ads na 1a mensagem do WhatsApp (espelha ctwaClid).
-- Aditivo: coluna nullable, sem DROP/TEMP.
ALTER TABLE "Lead" ADD COLUMN     "googleClickId" TEXT;

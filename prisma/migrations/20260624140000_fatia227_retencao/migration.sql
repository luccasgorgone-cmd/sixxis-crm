-- Fatia 2.27: raw podavel (retencao). Afrouxa NOT NULL (sem dropar coluna/dado).
ALTER TABLE "Mensagem" ALTER COLUMN "raw" DROP NOT NULL;

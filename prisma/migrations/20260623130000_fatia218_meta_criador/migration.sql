-- Fatia 2.18: autor da meta (trava de edicao). Aditivo.
ALTER TABLE "Meta" ADD COLUMN "criadoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fatia 2.85 (BLOCO C): contato compartilhado (vCard) na Mensagem. ADITIVO.
ALTER TABLE "Mensagem" ADD COLUMN "contatoNome" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN "contatoTelefone" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN "contatoVcard" TEXT;

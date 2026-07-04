-- Fatia 2.75: dados do cliente + endereco no ItemLocal (aba Local). ADITIVO, sem DROP.

-- Contato do cliente (snapshot editavel; copiado do lead quando vinculado)
ALTER TABLE "ItemLocal" ADD COLUMN "clienteNome" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "clienteTelefone" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "clienteEmail" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "clienteCpf" TEXT;

-- Endereco completo do cliente
ALTER TABLE "ItemLocal" ADD COLUMN "enderecoCep" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "enderecoLogradouro" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "enderecoNumero" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "enderecoComplemento" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "enderecoBairro" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "enderecoCidade" TEXT;
ALTER TABLE "ItemLocal" ADD COLUMN "enderecoUf" TEXT;

-- Indice por leadId (sincronia Local <-> Kanban/ficha: itens de um cliente)
CREATE INDEX IF NOT EXISTS "ItemLocal_leadId_idx" ON "ItemLocal"("leadId");

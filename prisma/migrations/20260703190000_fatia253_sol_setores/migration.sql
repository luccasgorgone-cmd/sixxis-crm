-- Fatia 2.53: controle de setores e telefones que a Sol atende. ADITIVO, sem
-- DROP. atendeVenda/atendePosVenda ligam por setor; instanciasAtendidas lista os
-- IDs de InstanciaWhatsApp (null/vazio = todos os numeros das finalidades ligadas).

-- AlterTable
ALTER TABLE "ConfigAgenteIA" ADD COLUMN     "atendeVenda" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ConfigAgenteIA" ADD COLUMN     "atendePosVenda" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConfigAgenteIA" ADD COLUMN     "instanciasAtendidas" JSONB;

-- Fatia 2.53: agente de IA renomeada de Luna para Sol. ADITIVO, sem DROP.
-- Atualiza o default de iaNome e corrige as linhas ja gravadas (se houver).

-- AlterTable (muda apenas o DEFAULT da coluna existente).
ALTER TABLE "Mensagem" ALTER COLUMN "iaNome" SET DEFAULT 'Sol';

-- Backfill pontual: linhas gravadas com o nome antigo passam a "Sol".
UPDATE "Mensagem" SET "iaNome" = 'Sol' WHERE "iaNome" = 'Luna';

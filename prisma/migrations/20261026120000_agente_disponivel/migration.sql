-- Separa DISPONIBILIDADE (Ausente/Disponivel, do vendedor) de ATIVO (conta/login,
-- do admin): assim o vendedor que se poe Ausente nao se tranca fora do login.
-- ADITIVO: 1 coluna, default true (todos disponiveis). Sem DROP/TEMP.
ALTER TABLE "Agente" ADD COLUMN     "disponivel" BOOLEAN NOT NULL DEFAULT true;

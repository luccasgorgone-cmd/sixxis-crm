-- AlterEnum
-- Adicionado em migracao separada: o Postgres nao permite usar um valor de enum
-- recem-criado na MESMA transacao em que ele e adicionado.
ALTER TYPE "Papel" ADD VALUE 'COLABORADOR';

-- AlterTable
ALTER TABLE "ConfigAgenteIA" ADD COLUMN     "opera24h" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usarHorarioComercial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "horarios" JSONB,
ADD COLUMN     "saudacaoAutomatica" TEXT,
ADD COLUMN     "segundosAntesDeResponder" INTEGER,
ADD COLUMN     "maxMensagensAntesHandoff" INTEGER,
ADD COLUMN     "mensagemHandoff" TEXT,
ADD COLUMN     "handoffSeClientePedir" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "handoffSeLeadQuente" BOOLEAN NOT NULL DEFAULT false;

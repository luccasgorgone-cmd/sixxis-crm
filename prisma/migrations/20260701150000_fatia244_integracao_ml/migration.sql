-- Fatia 2.44B: integracao OAuth com o Mercado Livre (singleton, id fixo "ml").
-- Aditivo, sem DROP: apenas CREATE TABLE. Tokens ficam no banco; credenciais do
-- app vem de env (ML_CLIENT_ID/ML_CLIENT_SECRET/ML_REDIRECT_URI).

-- CreateTable
CREATE TABLE "IntegracaoMercadoLivre" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiraEm" TIMESTAMP(3),
    "mlUserId" TEXT,
    "conectadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoMercadoLivre_pkey" PRIMARY KEY ("id")
);

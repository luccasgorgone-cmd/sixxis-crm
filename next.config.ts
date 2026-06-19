import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes nativos/Node que nao devem ser empacotados pelo bundler do Next
  // ao rodar nas rotas de servidor (Prisma 7 + driver pg).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;

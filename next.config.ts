import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes nativos/Node que nao devem ser empacotados pelo bundler do Next
  // ao rodar nas rotas de servidor (Prisma 7 + driver pg; sharp = binario nativo
  // usado para converter a logo webp -> PNG no PDF do orcamento, Fatia 3.16).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "sharp"],
};

export default nextConfig;

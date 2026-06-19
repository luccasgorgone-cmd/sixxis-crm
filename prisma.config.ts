// Configuracao da Prisma 7 (Rust-free). A URL de conexao deixou de ficar no
// schema.prisma e passou a viver aqui — usada pelos comandos de migracao
// (migrate dev / migrate deploy). Carregamos o .env manualmente porque a
// Prisma 7 nao le mais o .env automaticamente neste arquivo.
import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

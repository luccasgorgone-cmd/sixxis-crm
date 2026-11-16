// CLI de chaves da API de Leitura v1. Cria/lista/revoga chaves Bearer.
//
//   DATABASE_URL=... npx tsx scripts/api-chave.ts criar "<nome>" --escopos read:all,read:pii[,...] [--expira 2027-01-01]
//   DATABASE_URL=... npx tsx scripts/api-chave.ts listar
//   DATABASE_URL=... npx tsx scripts/api-chave.ts revogar <id|prefixo>
//
// SEGURANCA: o token em claro aparece UMA UNICA VEZ, no `criar`, no stdout deste
// terminal. O banco guarda so o hash SHA-256 (nunca o token). Nunca cole o token
// em chat/log/commit. Para revogar, use o id ou o prefixo (sxc_live_xxxxxxxx).

import { prisma } from "../src/lib/prisma";
import { gerarChave } from "../src/lib/api-v1/auth";
import { escoposDesconhecidos, TODOS_ESCOPOS } from "../src/lib/api-v1/escopos";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function criar() {
  const nome = process.argv[3];
  if (!nome || nome.startsWith("--")) {
    console.error('uso: criar "<nome>" --escopos a,b,c [--expira YYYY-MM-DD]');
    process.exitCode = 1;
    return;
  }
  const escoposRaw = arg("--escopos");
  const escopos = (escoposRaw ?? "read:all")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const desconhecidos = escoposDesconhecidos(escopos);
  if (desconhecidos.length) {
    console.warn(`AVISO: escopos nao catalogados (serao aceitos mesmo assim): ${desconhecidos.join(", ")}`);
    console.warn(`       catalogo: ${TODOS_ESCOPOS.join(", ")}`);
  }
  const expiraRaw = arg("--expira");
  let expiraEm: Date | null = null;
  if (expiraRaw) {
    expiraEm = new Date(expiraRaw);
    if (Number.isNaN(expiraEm.getTime())) {
      console.error(`--expira invalido: ${expiraRaw}`);
      process.exitCode = 1;
      return;
    }
  }

  const { token, hash, prefixo } = gerarChave();
  const chave = await prisma.apiChaveLeitura.create({
    data: { nome, prefixo, hash, escopos, expiraEm },
    select: { id: true, nome: true, prefixo: true, escopos: true, expiraEm: true },
  });

  console.log("\n=== CHAVE CRIADA (copie o token AGORA, nao sera exibido de novo) ===");
  console.log(`id:        ${chave.id}`);
  console.log(`nome:      ${chave.nome}`);
  console.log(`prefixo:   ${chave.prefixo}`);
  console.log(`escopos:   ${chave.escopos.join(", ")}`);
  console.log(`expira em: ${chave.expiraEm ? chave.expiraEm.toISOString() : "nunca"}`);
  console.log(`\nTOKEN:     ${token}`);
  console.log("\nUse em: Authorization: Bearer <TOKEN>\n");
}

async function listar() {
  const chaves = await prisma.apiChaveLeitura.findMany({
    orderBy: { criadoEm: "desc" },
    select: {
      id: true, nome: true, prefixo: true, escopos: true,
      criadoEm: true, ultimoUsoEm: true, expiraEm: true, revogadoEm: true,
    },
  });
  if (!chaves.length) {
    console.log("(nenhuma chave)");
    return;
  }
  for (const c of chaves) {
    const estado = c.revogadoEm
      ? `REVOGADA em ${c.revogadoEm.toISOString()}`
      : c.expiraEm && c.expiraEm < new Date()
        ? `EXPIRADA em ${c.expiraEm.toISOString()}`
        : "ATIVA";
    console.log(
      `${c.prefixo}  [${estado}]  ${c.nome}\n` +
        `   id=${c.id}  escopos=${c.escopos.join(",")}\n` +
        `   criada=${c.criadoEm.toISOString()}  ultimoUso=${c.ultimoUsoEm ? c.ultimoUsoEm.toISOString() : "nunca"}\n`,
    );
  }
}

async function revogar() {
  const alvo = process.argv[3];
  if (!alvo) {
    console.error("uso: revogar <id|prefixo>");
    process.exitCode = 1;
    return;
  }
  const chave = await prisma.apiChaveLeitura.findFirst({
    where: { OR: [{ id: alvo }, { prefixo: alvo }] },
    select: { id: true, nome: true, prefixo: true, revogadoEm: true },
  });
  if (!chave) {
    console.error(`chave nao encontrada: ${alvo}`);
    process.exitCode = 1;
    return;
  }
  if (chave.revogadoEm) {
    console.log(`ja estava revogada: ${chave.prefixo} (${chave.nome})`);
    return;
  }
  await prisma.apiChaveLeitura.update({ where: { id: chave.id }, data: { revogadoEm: new Date() } });
  console.log(`revogada: ${chave.prefixo} (${chave.nome})`);
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "criar": await criar(); break;
    case "listar": await listar(); break;
    case "revogar": await revogar(); break;
    default:
      console.error("comandos: criar | listar | revogar");
      process.exitCode = 1;
  }
  await prisma.$disconnect();
}

void main();

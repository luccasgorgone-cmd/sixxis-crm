// Escreve o CSV de conversoes offline do Google Ads no filesystem, no formato que
// o pipe datamanager_upload do Marketing le:
//   exports/google-offline-AAAA-MM-DD.csv  (UTF-8 sem BOM, LF)
//
// Uso: npx tsx scripts/exportar-google-offline.ts
// Read-only no banco; so escreve o arquivo. Nao envia nada pro Google.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  coletarLinhasGoogleOffline,
  montarCsvGoogleOffline,
} from "../src/lib/relatorios/googleOffline";

function dataHojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  const linhas = await coletarLinhasGoogleOffline();
  const csv = montarCsvGoogleOffline(linhas);

  const dir = path.resolve(process.cwd(), "exports");
  await fs.mkdir(dir, { recursive: true });
  const arquivo = path.join(dir, `google-offline-${dataHojeSaoPaulo()}.csv`);

  // encoding utf8 NAO prefixa BOM — bytes crus, exatamente como o Site grava.
  await fs.writeFile(arquivo, csv, { encoding: "utf8" });
  console.log(`[google-offline] ${linhas.length} linha(s) -> ${arquivo}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

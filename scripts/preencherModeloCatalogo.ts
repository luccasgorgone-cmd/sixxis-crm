// Preenche `modelo` e padroniza `categoria` dos 12 produtos do site no
// ProdutoCatalogo, para casar com a grafia da Loja (Blocos 2 e 3).
//
// MODO SEGURO — por padrao NAO grava nada:
//   npx tsx scripts/preencherModeloCatalogo.ts            -> SIMULACAO (de -> para)
//   npx tsx scripts/preencherModeloCatalogo.ts --aplicar  -> GRAVA
//
// Regras (nao negociaveis):
//  * so mexe em tipo=PRODUTO cujo NOME bate EXATO no mapa abaixo (12 registros);
//  * NAO toca em PECA nem em nenhum produto fora do mapa;
//  * se QUALQUER um dos 12 nomes nao for encontrado, NAO grava NADA (nem os que
//    bateram) e lista o que faltou + os nomes reais do catalogo, para ajustarmos
//    o mapa antes;
//  * um unico --aplicar grava as duas colunas (modelo e categoria).
//
// Idempotente: rodar 2x nao quebra (na 2a vez nada esta "de -> para" e o script
// reporta 0 alteracoes).
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { TipoCatalogo } from "../src/generated/prisma/enums";

// Grafia da Loja, confirmada. A chave e o NOME EXATO do produto no catalogo.
const ALVO: Record<string, { modelo: string; categoria: string }> = {
  "Aspirador Vertical Sixxis Bravo S2": { modelo: "Bravo S2", categoria: "Aspirador" },
  "Bicicleta Ergométrica Spinning Sixxis Cardio": {
    modelo: "Spinning Cardio",
    categoria: "Bike Spinning",
  },
  "Bicicleta Spinning Sixxis Life": { modelo: "Spinning Life", categoria: "Bike Spinning" },
  "Climatizador M45 Trend": { modelo: "M45 Trend", categoria: "Climatizador" },
  "Climatizador SX040 Trend": { modelo: "SX040 Trend", categoria: "Climatizador" },
  "Climatizador SX060 Prime": { modelo: "SX060 Prime", categoria: "Climatizador" },
  "Climatizador SX070 Trend": { modelo: "SX070 Trend", categoria: "Climatizador" },
  "Climatizador SX100 Trend": { modelo: "SX100 Trend", categoria: "Climatizador" },
  "Climatizador SX120 Prime": { modelo: "SX120 Prime", categoria: "Climatizador" },
  "Climatizador SX180 Trend": { modelo: "SX180 Trend", categoria: "Climatizador" },
  "Climatizador SX200 Prime": { modelo: "SX200 Prime", categoria: "Climatizador" },
  "Climatizador SX200 Trend": { modelo: "SX200 Trend", categoria: "Climatizador" },
};

const APLICAR = process.argv.includes("--aplicar");

function col(v: string | null | undefined, largura: number): string {
  const s = v == null || v === "" ? "—" : v;
  return s.length > largura ? s.slice(0, largura - 1) + "…" : s.padEnd(largura);
}

async function main(): Promise<void> {
  const nomes = Object.keys(ALVO);
  console.log(
    `[catalogo] modo: ${APLICAR ? "APLICAR (grava)" : "SIMULACAO (nao grava)"} — ` +
      `${nomes.length} produtos no mapa`,
  );

  // Busca so os PRODUTOs com nome exatamente igual a alguma chave do mapa.
  const achados = await prisma.produtoCatalogo.findMany({
    where: { tipo: TipoCatalogo.PRODUTO, nome: { in: nomes } },
    select: { id: true, nome: true, modelo: true, categoria: true },
    orderBy: { nome: "asc" },
  });

  // Trava: um nome do mapa sem correspondencia = grafia divergente. Nao grava nada.
  const encontrados = new Set(achados.map((a) => a.nome));
  const faltando = nomes.filter((n) => !encontrados.has(n));
  // Nome duplicado no catalogo tambem e ambiguo demais para gravar as cegas.
  const duplicados = nomes.filter((n) => achados.filter((a) => a.nome === n).length > 1);

  console.log("");
  console.log(
    "nome" .padEnd(46) + "| " + "modelo (de -> para)".padEnd(38) + "| categoria (de -> para)",
  );
  console.log("-".repeat(46) + "+-" + "-".repeat(38) + "+" + "-".repeat(34));
  let mudariam = 0;
  for (const p of achados) {
    const alvo = ALVO[p.nome];
    const mudaModelo = (p.modelo ?? "") !== alvo.modelo;
    const mudaCategoria = (p.categoria ?? "") !== alvo.categoria;
    if (mudaModelo || mudaCategoria) mudariam += 1;
    console.log(
      col(p.nome, 46) +
        "| " +
        col(`${p.modelo ?? "—"} -> ${alvo.modelo}`, 38) +
        "| " +
        `${p.categoria ?? "—"} -> ${alvo.categoria}` +
        (mudaModelo || mudaCategoria ? "" : "  (ja ok)"),
    );
    console.log("  id: " + p.id);
  }

  if (faltando.length > 0 || duplicados.length > 0) {
    console.log("\n[catalogo] NAO GRAVEI NADA — o mapa precisa de ajuste antes.");
    if (faltando.length > 0) {
      console.log(`\nNomes do mapa NAO encontrados no catalogo (${faltando.length}):`);
      for (const n of faltando) console.log("  - " + n);
      // Ajuda a corrigir a grafia: mostra os nomes reais de PRODUTO no catalogo.
      const todos = await prisma.produtoCatalogo.findMany({
        where: { tipo: TipoCatalogo.PRODUTO },
        select: { id: true, nome: true, modelo: true, categoria: true },
        orderBy: { nome: "asc" },
      });
      console.log(`\nNomes REAIS de tipo=PRODUTO no catalogo (${todos.length}):`);
      for (const t of todos) {
        console.log(
          `  - "${t.nome}"  [modelo: ${t.modelo ?? "—"} | categoria: ${t.categoria ?? "—"} | id: ${t.id}]`,
        );
      }
    }
    if (duplicados.length > 0) {
      console.log(`\nNomes com MAIS DE UM registro (ambiguo):`);
      for (const n of duplicados) console.log("  - " + n);
    }
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n[catalogo] ${achados.length}/${nomes.length} produtos casaram; ` +
      `${mudariam} teriam alteracao.`,
  );

  if (!APLICAR) {
    console.log("[catalogo] SIMULACAO — nada foi gravado.");
    console.log("[catalogo] rode com --aplicar para gravar.");
    await prisma.$disconnect();
    return;
  }

  // Grava: uma transacao, update por id (nunca por nome), so nos 12 casados.
  const updates = achados.map((p) =>
    prisma.produtoCatalogo.update({
      where: { id: p.id },
      data: { modelo: ALVO[p.nome].modelo, categoria: ALVO[p.nome].categoria },
    }),
  );
  await prisma.$transaction(updates);
  console.log(`[catalogo] APLICADO: ${updates.length} produtos atualizados (modelo + categoria).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[catalogo] erro:", e);
  await prisma.$disconnect();
  process.exitCode = 1;
});

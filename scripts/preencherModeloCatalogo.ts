// Preenche `modelo` e padroniza `categoria` dos 12 produtos do site no
// ProdutoCatalogo, para casar com a grafia da Loja.
//
// ATALHO PELO TERMINAL — a via normal e a TELA: Admin > Catalogo > "Casar com a
// Loja" (GET/POST /api/admin/catalogo/casar-loja), que faz exatamente isto no
// navegador, sem DATABASE_URL. Mapa e regra sao os MESMOS (lib/casarLoja).
//
// MODO SEGURO — por padrao NAO grava nada:
//   npx tsx scripts/preencherModeloCatalogo.ts            -> SIMULACAO (de -> para)
//   npx tsx scripts/preencherModeloCatalogo.ts --aplicar  -> GRAVA
//
// Regras (nao negociaveis, iguais as da rota):
//  * so mexe em tipo=PRODUTO cujo NOME bate EXATO no mapa (12 registros);
//  * NAO toca em PECA nem em nenhum produto fora do mapa;
//  * se QUALQUER um dos 12 nao casar (ou houver nome duplicado), NAO grava NADA
//    e lista o que faltou + os nomes reais do catalogo;
//  * um unico --aplicar grava as duas colunas (modelo e categoria).
//
// Idempotente: rodar 2x nao quebra (na 2a vez nada esta "de -> para").
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { TipoCatalogo } from "../src/generated/prisma/enums";
import { NOMES_CASAR_LOJA, MAPA_CASAR_LOJA, simularCasamento } from "../src/lib/casarLoja";

const APLICAR = process.argv.includes("--aplicar");

function col(v: string | null | undefined, largura: number): string {
  const s = v == null || v === "" ? "—" : v;
  return s.length > largura ? s.slice(0, largura - 1) + "…" : s.padEnd(largura);
}

async function main(): Promise<void> {
  console.log(
    `[catalogo] modo: ${APLICAR ? "APLICAR (grava)" : "SIMULACAO (nao grava)"} — ` +
      `${NOMES_CASAR_LOJA.length} produtos no mapa`,
  );

  const achados = await prisma.produtoCatalogo.findMany({
    where: { tipo: TipoCatalogo.PRODUTO, nome: { in: NOMES_CASAR_LOJA } },
    select: { id: true, nome: true, modelo: true, categoria: true },
  });
  const sim = simularCasamento(achados);

  console.log("");
  console.log(
    "nome".padEnd(46) + "| " + "modelo (de -> para)".padEnd(38) + "| categoria (de -> para)",
  );
  console.log("-".repeat(46) + "+-" + "-".repeat(38) + "+" + "-".repeat(34));
  for (const l of sim.linhas) {
    console.log(
      col(l.nome, 46) +
        "| " +
        col(`${l.modeloAtual ?? "—"} -> ${l.modeloNovo}`, 38) +
        "| " +
        `${l.categoriaAtual ?? "—"} -> ${l.categoriaNova}` +
        (l.muda ? "" : "  (ja ok)"),
    );
    console.log("  id: " + l.id);
  }

  if (!sim.ok) {
    console.log("\n[catalogo] NAO GRAVEI NADA — o catalogo precisa de ajuste antes.");
    if (sim.faltando.length > 0) {
      console.log(`\nNomes do mapa NAO encontrados no catalogo (${sim.faltando.length}):`);
      for (const n of sim.faltando) console.log("  - " + n);
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
    if (sim.duplicados.length > 0) {
      console.log(`\nNomes com MAIS DE UM registro (ambiguo):`);
      for (const n of sim.duplicados) console.log("  - " + n);
    }
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n[catalogo] ${sim.casados}/${sim.esperados} produtos casaram; ` +
      `${sim.mudariam} teriam alteracao.`,
  );

  if (!APLICAR) {
    console.log("[catalogo] SIMULACAO — nada foi gravado.");
    console.log("[catalogo] rode com --aplicar para gravar.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    sim.linhas.map((l) =>
      prisma.produtoCatalogo.update({
        where: { id: l.id },
        data: {
          modelo: MAPA_CASAR_LOJA[l.nome].modelo,
          categoria: MAPA_CASAR_LOJA[l.nome].categoria,
        },
      }),
    ),
  );
  console.log(`[catalogo] APLICADO: ${sim.linhas.length} produtos atualizados (modelo + categoria).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[catalogo] erro:", e);
  await prisma.$disconnect();
  process.exitCode = 1;
});

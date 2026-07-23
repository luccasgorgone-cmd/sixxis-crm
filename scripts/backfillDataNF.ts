// Backfill GUARDADO (Fatia AC, Bloco 3): corrige NotaFiscal.dataNF gravada a
// meia-noite UTC (00:00:00.000Z), que no fuso do Brasil aparece um dia a menos e
// vence a garantia cedo. A correcao soma 12h -> passa ao MEIO-DIA UTC do MESMO
// dia (nao muda o dia, so tira o risco de deslocamento).
//
// Rode com DATABASE_URL apontando ao banco:
//   npx tsx scripts/backfillDataNF.ts
//
// SEGURO: primeiro CONTA e imprime o total. So altera se forem <= LIMITE (50).
// Acima disso, NAO altera e pede decisao do dono. Idempotente: so toca linhas
// exatamente a meia-noite UTC; apos corrigidas (meio-dia) nunca mais sao tocadas.
import { prisma } from "../src/lib/prisma";

const LIMITE = 50;

function ehMeiaNoiteUTC(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

async function main() {
  const todas = await prisma.notaFiscal.findMany({
    select: { id: true, numero: true, dataNF: true },
  });
  const alvo = todas.filter((n) => ehMeiaNoiteUTC(n.dataNF));

  console.log(`Total de NotaFiscal: ${todas.length}`);
  console.log(`A meia-noite UTC (00:00:00.000Z): ${alvo.length}`);

  if (alvo.length === 0) {
    console.log("Nada a corrigir.");
    return;
  }
  if (alvo.length > LIMITE) {
    console.log(
      `ACIMA DO LIMITE (${LIMITE}). NAO alterado — decisao do dono. ` +
        `Reporte ${alvo.length} para revisao.`,
    );
    return;
  }

  let alteradas = 0;
  for (const n of alvo) {
    const corrigida = new Date(n.dataNF.getTime() + 12 * 60 * 60 * 1000);
    await prisma.notaFiscal.update({
      where: { id: n.id },
      data: { dataNF: corrigida },
    });
    alteradas += 1;
    console.log(
      `NF ${n.numero}: ${n.dataNF.toISOString()} -> ${corrigida.toISOString()}`,
    );
  }
  console.log(`Linhas alteradas: ${alteradas}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

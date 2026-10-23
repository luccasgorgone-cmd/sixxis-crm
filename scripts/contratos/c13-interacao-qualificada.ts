// Contrato dourado C13 — heurística de INTERAÇÃO QUALIFICADA (Manual secao 6).
//   npx tsx scripts/contratos/c13-interacao-qualificada.ts
import assert from "node:assert";
import { ehInteracaoQualificada } from "../../src/lib/reguaFollowup";

let ok = 0, falhou = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ok  ${nome}`); }
  catch (e) { falhou++; console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`); }
}

// QUALIFICA (conteúdo de compra)
for (const t of [
  "Qual o preço?", "quanto custa o 9000 btus",
  "tem frete pra 01310?", "me manda o link", "pode fazer um orçamento?",
  "qual o prazo de entrega", "dá pra parcelar?", "tem desconto?",
  "aceita pix?", "quero comprar", "fechar com voçê", "qual a voltagem?",
]) {
  caso(`qualifica: "${t}"`, () => assert.equal(ehInteracaoQualificada(t), true));
}

// NÃO qualifica (ruído)
for (const t of ["ok", "👍", "vou ver", "depois falo", "obrigado", "", "  "]) {
  caso(`nao qualifica: "${t}"`, () => assert.equal(ehInteracaoQualificada(t), false));
}

console.log(`\nc13-interacao-qualificada: ${ok} ok, ${falhou} falhou`);
if (falhou > 0) process.exit(1);

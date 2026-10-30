// Contrato dourado C16 — calculo puro do "A Prazo" (recontato agendado).
//   npx tsx scripts/contratos/c16-aprazo.ts
//
// Prova, sem banco/rede, que o prazo e em dias CORRIDOS (agora + N*24h), que o
// vencimento e >= prazo, e que os dias sao normalizados (min 1, max 365, arredonda).
import assert from "node:assert";
import {
  prazoAteDe,
  prazoVencido,
  normalizarDias,
  DIAS_MIN,
  DIAS_MAX,
} from "../../src/lib/aprazo/calc";

let ok = 0;
let falhou = 0;
function caso(nome: string, fn: () => void): void {
  try {
    fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhou++;
    console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const base = new Date("2026-10-30T12:00:00.000Z");

caso("prazo = agora + N dias CORRIDOS (inclui fim de semana)", () => {
  const p = prazoAteDe(base, 7);
  assert.equal(p.getTime(), base.getTime() + 7 * 24 * 60 * 60 * 1000);
});

caso("vencido: antes do prazo = false; no/depois = true", () => {
  const p = prazoAteDe(base, 7);
  const dia6 = new Date(base.getTime() + 6 * 86_400_000);
  const dia7 = new Date(p.getTime());
  const dia8 = new Date(base.getTime() + 8 * 86_400_000);
  assert.equal(prazoVencido(p, dia6), false);
  assert.equal(prazoVencido(p, dia7), true);
  assert.equal(prazoVencido(p, dia8), true);
});

caso("sem prazo (null) nunca vence", () => {
  assert.equal(prazoVencido(null, base), false);
  assert.equal(prazoVencido(undefined, base), false);
});

caso("normalizarDias: min 1, max 365, arredonda, trata invalido", () => {
  assert.equal(normalizarDias(0), DIAS_MIN);
  assert.equal(normalizarDias(-3), DIAS_MIN);
  assert.equal(normalizarDias(7), 7);
  assert.equal(normalizarDias(7.4), 7);
  assert.equal(normalizarDias(7.6), 8);
  assert.equal(normalizarDias(9999), DIAS_MAX);
  assert.equal(normalizarDias(Number.NaN), DIAS_MIN);
});

console.log(`\nC16 A Prazo: ${ok} ok, ${falhou} falhou`);
process.exit(falhou > 0 ? 1 : 0);

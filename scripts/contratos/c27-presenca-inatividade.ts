// Contrato dourado C27 — varredura de presenca morta (bug ausencia/roteamento).
//   npx tsx scripts/contratos/c27-presenca-inatividade.ts
//
// BUG relatado pelo Luccas: (1) "ausente nao fica apos 15 min de inatividade" e
// (2) "demora horas pra voltar a receber leads depois de ficar online". Raiz: o
// rodizio olhava um flag manual, nao a presenca. Agora a presenca dirige o
// rodizio e o servidor derruba quem para de mandar heartbeat (fechou a aba / caiu
// a rede). Esta prova trava a regra PURA que decide quem derrubar, para nunca
// derrubar conta legada (null -> blackout) nem quem bateu agora.
//
// Sem banco e sem rede: so a funcao pura e as constantes.
import assert from "node:assert";
import {
  presencaExpirou,
  HEARTBEAT_MS,
  LIMITE_PRESENCA_MS,
} from "../../src/lib/presenca/inatividade";

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

const AGORA = new Date("2026-11-23T12:00:00.000Z");
const atras = (ms: number) => new Date(AGORA.getTime() - ms);

// --- null NUNCA expira (conta legada nao e derrubada -> sem blackout) --------

caso("ultimaPresencaEm null -> NAO expira (conta legada protegida)", () => {
  assert.equal(presencaExpirou(null, AGORA), false);
});

caso("undefined -> NAO expira", () => {
  assert.equal(presencaExpirou(undefined, AGORA), false);
});

// --- heartbeat recente mantem no rodizio -------------------------------------

caso("bateu agora -> NAO expira", () => {
  assert.equal(presencaExpirou(AGORA, AGORA), false);
});

caso("bateu ha 1 min (< limite) -> NAO expira", () => {
  assert.equal(presencaExpirou(atras(60_000), AGORA), false);
});

caso("bateu ha 4min59s (< 5min) -> NAO expira", () => {
  assert.equal(presencaExpirou(atras(LIMITE_PRESENCA_MS - 1000), AGORA), false);
});

// --- heartbeat velho derruba (sai do rodizio) --------------------------------

caso("bateu ha 6 min (> limite) -> EXPIRA (derruba)", () => {
  assert.equal(presencaExpirou(atras(6 * 60_000), AGORA), true);
});

caso("bateu ha 2 horas -> EXPIRA (caso dos '2h sem lead' do outro lado)", () => {
  assert.equal(presencaExpirou(atras(2 * 60 * 60_000), AGORA), true);
});

// --- borda exata do limite ---------------------------------------------------

caso("exatamente no limite (==) -> NAO expira (so > derruba)", () => {
  assert.equal(presencaExpirou(atras(LIMITE_PRESENCA_MS), AGORA), false);
});

caso("1ms alem do limite -> EXPIRA", () => {
  assert.equal(presencaExpirou(atras(LIMITE_PRESENCA_MS + 1), AGORA), true);
});

// --- limite customizado respeitado -------------------------------------------

caso("limite custom de 2min: 3min atras expira", () => {
  assert.equal(presencaExpirou(atras(3 * 60_000), AGORA, 2 * 60_000), true);
});

// --- invariante das constantes (folga pro throttle de aba de fundo) ----------

caso("LIMITE_PRESENCA_MS tem folga sobre o HEARTBEAT (nao derruba por 1 batida)", () => {
  // Precisa aguentar varias batidas perdidas (aba em segundo plano ~1/min).
  assert.ok(LIMITE_PRESENCA_MS >= HEARTBEAT_MS * 3);
});

console.log(`\nC27 varredura de presenca (ausencia/roteamento): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

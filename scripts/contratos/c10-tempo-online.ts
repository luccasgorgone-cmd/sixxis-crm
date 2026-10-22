// Contrato dourado C10 — tempo-online puro (base da métrica por presença).
//   npx tsx scripts/contratos/c10-tempo-online.ts
//
// Prova, sem banco/rede, que segundosOnlineEntre soma a interseção de períodos
// ONLINE com a janela [de, ate]: período dentro, cruzando a borda, fora, ainda
// aberto (fim=null) e múltiplos períodos.
import assert from "node:assert";
import {
  segundosOnlineEntre,
  type PeriodoOnline,
} from "../../src/lib/presenca/tempoOnline";

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

const de = new Date("2026-10-10T09:00:00Z");
const ate = new Date("2026-10-10T18:00:00Z");
const d = (h: string) => new Date(`2026-10-10T${h}:00Z`);

caso("vazio -> 0", () => {
  assert.equal(segundosOnlineEntre([], de, ate), 0);
});

caso("periodo totalmente dentro -> duracao", () => {
  const p: PeriodoOnline[] = [{ inicio: d("10:00"), fim: d("10:30") }];
  assert.equal(segundosOnlineEntre(p, de, ate), 1800);
});

caso("periodo cruza a borda inicial -> so a parte dentro", () => {
  const p: PeriodoOnline[] = [{ inicio: d("08:00"), fim: d("10:00") }];
  assert.equal(segundosOnlineEntre(p, de, ate), 3600); // 09:00->10:00
});

caso("periodo fora da janela -> 0", () => {
  const p: PeriodoOnline[] = [{ inicio: d("19:00"), fim: d("20:00") }];
  assert.equal(segundosOnlineEntre(p, de, ate), 0);
});

caso("periodo ainda aberto (fim=null) -> conta ate 'ate'", () => {
  const p: PeriodoOnline[] = [{ inicio: d("17:00"), fim: null }];
  assert.equal(segundosOnlineEntre(p, de, ate), 3600); // 17:00->18:00
});

caso("multiplos periodos somam", () => {
  const p: PeriodoOnline[] = [
    { inicio: d("09:00"), fim: d("09:10") }, // 600
    { inicio: d("10:00"), fim: d("10:05") }, // 300
  ];
  assert.equal(segundosOnlineEntre(p, de, ate), 900);
});

console.log(`\nc10-tempo-online: ${ok} ok, ${falhou} falhou`);
if (falhou > 0) process.exit(1);

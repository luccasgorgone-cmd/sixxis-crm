// Contrato dourado C15 — nivel de SLA puro (base dos 3 estados do card).
//   npx tsx scripts/contratos/c15-sla-nivel.ts
//
// Prova, sem banco/rede, a arvore de decisao de nivelSla: longe do prazo = null,
// janela de 12h antes = AMARELO, no/alem do prazo = VERMELHO. Inclui etapa de
// prazo curto (limiar <= margem) e limiar invalido. VIP nao chega aqui (e
// filtrado antes no motor), entao nao e caso deste contrato.
import assert from "node:assert";
import { nivelSla, MARGEM_AMARELO_MIN } from "../../src/lib/sla/nivel";

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

// Prazo de 1 dia util = 540 min; margem amarela = 720 min (12h). Aqui uso um
// prazo FOLGADO (> margem) para separar bem as 3 faixas: limiar = 3000 min.
const LIM = 3000;
const MARG = MARGEM_AMARELO_MIN; // 720

caso("bem longe do prazo -> null", () => {
  assert.equal(nivelSla(0, LIM, MARG), null);
  assert.equal(nivelSla(LIM - MARG - 1, LIM, MARG), null);
});

caso("entrou na janela de 12h -> AMARELO", () => {
  assert.equal(nivelSla(LIM - MARG, LIM, MARG), "AMARELO");
  assert.equal(nivelSla(LIM - 1, LIM, MARG), "AMARELO");
});

caso("no prazo exato -> VERMELHO", () => {
  assert.equal(nivelSla(LIM, LIM, MARG), "VERMELHO");
});

caso("alem do prazo -> VERMELHO", () => {
  assert.equal(nivelSla(LIM + 10_000, LIM, MARG), "VERMELHO");
});

caso("prazo curto (limiar <= margem): janela amarela vira [0, limiar)", () => {
  // Novo = 60 min, margem 720: antes de vencer ja e AMARELO desde 0.
  assert.equal(nivelSla(0, 60, MARG), "AMARELO");
  assert.equal(nivelSla(59, 60, MARG), "AMARELO");
  assert.equal(nivelSla(60, 60, MARG), "VERMELHO");
});

caso("limiar invalido (<=0) -> null (nunca marca)", () => {
  assert.equal(nivelSla(1000, 0, MARG), null);
  assert.equal(nivelSla(1000, -5, MARG), null);
});

caso("default da margem = 12h (720 min)", () => {
  assert.equal(MARGEM_AMARELO_MIN, 720);
  // Sem passar margem explicita, usa o default.
  assert.equal(nivelSla(LIM - 720, LIM), "AMARELO");
  assert.equal(nivelSla(LIM - 721, LIM), null);
});

console.log(`\nC15 SLA nivel: ${ok} ok, ${falhou} falhou`);
process.exit(falhou > 0 ? 1 : 0);

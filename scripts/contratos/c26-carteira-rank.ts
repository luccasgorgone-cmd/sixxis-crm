// Contrato dourado C26 — avanco de status da Carteira de Leads (frente 6).
//   npx tsx scripts/contratos/c26-carteira-rank.ts
//
// BUG relatado pelo Luccas: "cliente que ja respondeu nao aparece" e "sem
// interesse ja marcado nao aparece" na Carteira de Leads. Causa raiz: nada
// escrevia RESPONDEU/DESCARTADO/CONVERTIDO; agora dois gatilhos (sync.ts)
// escrevem usando a regra PURA deveAvancarStatusCarteira. Esta prova trava essa
// regra para que o funil so AVANCE e nunca regrida — senao uma mensagem de
// entrada depois de um GANHO rebaixaria o cliente de CONVERTIDO para RESPONDEU.
//
// Ordem canonica: NOVO(0) < EM_ABORDAGEM(1) < RESPONDEU(2) < DESCARTADO(3) <
// CONVERTIDO(4). Sem banco e sem rede: so a funcao pura e o RANK.
import assert from "node:assert";
import { deveAvancarStatusCarteira, RANK } from "../../src/lib/carteira/rank";

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

// --- avanca quando o alvo esta acima -----------------------------------------

caso("NOVO -> RESPONDEU avanca (prospect respondeu)", () => {
  assert.equal(deveAvancarStatusCarteira("NOVO", "RESPONDEU"), true);
});

caso("EM_ABORDAGEM -> RESPONDEU avanca", () => {
  assert.equal(deveAvancarStatusCarteira("EM_ABORDAGEM", "RESPONDEU"), true);
});

caso("RESPONDEU -> DESCARTADO avanca (respondeu e depois sem interesse)", () => {
  assert.equal(deveAvancarStatusCarteira("RESPONDEU", "DESCARTADO"), true);
});

caso("DESCARTADO -> CONVERTIDO avanca (sinal de compra sobrepoe a perda)", () => {
  assert.equal(deveAvancarStatusCarteira("DESCARTADO", "CONVERTIDO"), true);
});

caso("NOVO -> CONVERTIDO avanca (comprou direto)", () => {
  assert.equal(deveAvancarStatusCarteira("NOVO", "CONVERTIDO"), true);
});

// --- NUNCA regride -----------------------------------------------------------

caso("CONVERTIDO nao regride com mensagem de entrada (-> RESPONDEU) [frentes 3/4]", () => {
  assert.equal(deveAvancarStatusCarteira("CONVERTIDO", "RESPONDEU"), false);
});

caso("CONVERTIDO nao vira DESCARTADO por automacao", () => {
  assert.equal(deveAvancarStatusCarteira("CONVERTIDO", "DESCARTADO"), false);
});

caso("RESPONDEU nao volta pra EM_ABORDAGEM", () => {
  assert.equal(deveAvancarStatusCarteira("RESPONDEU", "EM_ABORDAGEM"), false);
});

caso("DESCARTADO nao volta pra RESPONDEU", () => {
  assert.equal(deveAvancarStatusCarteira("DESCARTADO", "RESPONDEU"), false);
});

// --- nao avanca para o mesmo status (idempotente) ----------------------------

caso("mesmo status nao avanca (RESPONDEU -> RESPONDEU)", () => {
  assert.equal(deveAvancarStatusCarteira("RESPONDEU", "RESPONDEU"), false);
});

caso("mesmo status nao avanca (NOVO -> NOVO)", () => {
  assert.equal(deveAvancarStatusCarteira("NOVO", "NOVO"), false);
});

// --- o RANK em si trava a ordem canonica -------------------------------------

caso("RANK respeita a ordem NOVO<EM_ABORDAGEM<RESPONDEU<DESCARTADO<CONVERTIDO", () => {
  assert.ok(RANK.NOVO < RANK.EM_ABORDAGEM);
  assert.ok(RANK.EM_ABORDAGEM < RANK.RESPONDEU);
  assert.ok(RANK.RESPONDEU < RANK.DESCARTADO);
  assert.ok(RANK.DESCARTADO < RANK.CONVERTIDO);
  // CONVERTIDO e o apex absoluto.
  assert.equal(Math.max(...Object.values(RANK)), RANK.CONVERTIDO);
});

console.log(`\nC26 avanco de status da Carteira (frente 6): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

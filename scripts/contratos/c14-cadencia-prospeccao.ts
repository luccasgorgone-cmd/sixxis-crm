// Contrato dourado C14 — cadência de 4 semanas da prospecção (Manual Fase 2).
//   npx tsx scripts/contratos/c14-cadencia-prospeccao.ts
import assert from "node:assert";
import {
  semanaCadencia,
  faseEsperada,
  podeEncerrarSemResposta,
  nutricaoVoltaEm,
} from "../../src/lib/prospeccao/cadencia";

let ok = 0, falhou = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ok  ${nome}`); }
  catch (e) { falhou++; console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`); }
}

const d0 = new Date("2026-10-01T09:00:00Z");
const mais = (dias: number) => new Date(d0.getTime() + dias * 86_400_000);

caso("semana: D0 -> 1", () => assert.equal(semanaCadencia(d0, d0), 1));
caso("semana: D6 -> 1", () => assert.equal(semanaCadencia(d0, mais(6)), 1));
caso("semana: D7 -> 2", () => assert.equal(semanaCadencia(d0, mais(7)), 2));
caso("semana: D20 -> 3", () => assert.equal(semanaCadencia(d0, mais(20)), 3));
caso("semana: D28 -> 5", () => assert.equal(semanaCadencia(d0, mais(28)), 5));

caso("fase S1 = ABORDAGEM", () => assert.equal(faseEsperada(d0, mais(2)), "ABORDAGEM"));
caso("fase S2 = QUALIFICACAO", () => assert.equal(faseEsperada(d0, mais(8)), "QUALIFICACAO"));
caso("fase S3 = PROPOSTA", () => assert.equal(faseEsperada(d0, mais(15)), "PROPOSTA"));
caso("fase S4 = FECHAMENTO", () => assert.equal(faseEsperada(d0, mais(22)), "FECHAMENTO"));
caso("fim S4 (D29) = NUTRICAO", () => assert.equal(faseEsperada(d0, mais(29)), "NUTRICAO"));

caso("sem resposta: 5 tentativas / 2 canais -> true", () => assert.equal(podeEncerrarSemResposta(5, 2), true));
caso("sem resposta: 4 tentativas -> false", () => assert.equal(podeEncerrarSemResposta(4, 2), false));
caso("sem resposta: 5 tentativas / 1 canal -> false", () => assert.equal(podeEncerrarSemResposta(5, 1), false));

caso("nutricao volta em +90 dias", () => {
  const v = nutricaoVoltaEm(d0);
  assert.equal(Math.round((v.getTime() - d0.getTime()) / 86_400_000), 90);
});

console.log(`\nc14-cadencia-prospeccao: ${ok} ok, ${falhou} falhou`);
if (falhou > 0) process.exit(1);

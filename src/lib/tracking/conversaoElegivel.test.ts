// Cobre a trava "SO VENDA NOVA vai para Meta/Google".
// Roda sem framework extra: `npx tsx --test src/lib/tracking/conversaoElegivel.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";

import { Finalidade } from "@/generated/prisma/enums";
import {
  ehFinalidadeDeConversao,
  whereGanhosGoogleOffline,
} from "@/lib/tracking/conversaoElegivel";

test("VENDA nova e elegivel -> Purchase/conversao dispara", () => {
  assert.equal(ehFinalidadeDeConversao(Finalidade.VENDA), true);
});

test("POS_VENDA e bloqueada -> nada vai para Meta/Google", () => {
  assert.equal(ehFinalidadeDeConversao(Finalidade.POS_VENDA), false);
});

test("toda finalidade != VENDA fica de fora (nenhuma brecha)", () => {
  for (const f of Object.values(Finalidade)) {
    const esperado = f === Finalidade.VENDA;
    assert.equal(
      ehFinalidadeDeConversao(f as Finalidade),
      esperado,
      `finalidade ${String(f)} deveria ser ${esperado ? "enviada" : "bloqueada"}`,
    );
  }
});

test("where do Google offline trava em finalidade=VENDA (pos-venda bloqueada)", () => {
  const where = whereGanhosGoogleOffline();
  assert.equal(where.finalidade, Finalidade.VENDA);
});

test("where do Google offline preserva os filtros historicos (sem regressao)", () => {
  const where = whereGanhosGoogleOffline();
  assert.equal(where.status, "GANHO");
  assert.equal(where.valor, undefined);
  assert.deepEqual(where.OR, [
    { valorAjustado: { gt: 0 } },
    { valorAjustado: null, valor: { gt: 0 } },
  ]);
  assert.deepEqual(where.lead, { googleClickId: { not: null } });
});

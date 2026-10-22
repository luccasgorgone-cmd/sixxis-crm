// Contrato dourado C9 — agregador puro da aba "Captação Ativa".
//   npx tsx scripts/contratos/c9-captacao.ts
//
// Prova, sem banco/rede, que agregarCaptacao:
//  - lida com janela vazia (sem divisão por zero);
//  - soma total, vendedores que captaram, convertidos (coorte GANHO) e R$;
//  - agrupa lead sem dono num bucket "(sem vendedor)" que não conta como vendedor;
//  - ignora captado sem GANHO na conversão/R$;
//  - calcula delta vs. período anterior com guarda de zero (null quando anterior=0);
//  - agrupa a série por dia no fuso America/Sao_Paulo.
import assert from "node:assert";
import {
  agregarCaptacao,
  type LinhaCaptacao,
} from "../../src/lib/supervisor/captacao";

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

function linha(over: Partial<LinhaCaptacao>): LinhaCaptacao {
  return {
    leadId: "l1",
    nome: "Cliente",
    telefone: "5511999999999",
    donoId: "v1",
    donoNome: "Vendedor 1",
    cadastradoPorId: "v1",
    cadastradoPorNome: "Vendedor 1",
    criadoEm: new Date("2026-10-10T12:00:00Z"),
    etapaAtual: "Novo",
    status: "ABERTO",
    valorGanho: null,
    ...over,
  };
}

const ANTERIOR_ZERO = { total: 0, conversao: 0, valorGerado: 0 };

caso("janela vazia -> zeros, sem throw", () => {
  const r = agregarCaptacao([], ANTERIOR_ZERO);
  assert.equal(r.total, 0);
  assert.equal(r.vendedoresQueCaptaram, 0);
  assert.equal(r.convertidos, 0);
  assert.equal(r.conversao, 0);
  assert.equal(r.valorGerado, 0);
  assert.deepEqual(r.ranking, []);
  assert.deepEqual(r.serie, []);
  assert.equal(r.delta.total, null);
});

caso("3 captados / 2 vendedores / 1 convertido GANHO 1000", () => {
  const linhas = [
    linha({ leadId: "a", donoId: "v1", donoNome: "V1", status: "GANHO", valorGanho: 1000 }),
    linha({ leadId: "b", donoId: "v1", donoNome: "V1", status: "ABERTO" }),
    linha({ leadId: "c", donoId: "v2", donoNome: "V2", status: "PERDIDO" }),
  ];
  const r = agregarCaptacao(linhas, ANTERIOR_ZERO);
  assert.equal(r.total, 3);
  assert.equal(r.vendedoresQueCaptaram, 2);
  assert.equal(r.convertidos, 1);
  assert.ok(Math.abs(r.conversao - 1 / 3) < 1e-9);
  assert.equal(r.valorGerado, 1000);
  const v1 = r.ranking.find((x) => x.agenteId === "v1");
  assert.ok(v1 && v1.captados === 2 && v1.convertidos === 1 && v1.valorGerado === 1000);
});

caso("lead sem dono -> bucket (sem vendedor), não conta como vendedor", () => {
  const r = agregarCaptacao(
    [linha({ leadId: "a", donoId: null, donoNome: null })],
    ANTERIOR_ZERO,
  );
  assert.equal(r.total, 1);
  assert.equal(r.vendedoresQueCaptaram, 0);
  const semDono = r.ranking.find((x) => x.agenteId === null);
  assert.ok(semDono && semDono.nome === "(sem vendedor)" && semDono.captados === 1);
});

caso("captado sem GANHO não soma conversão/R$", () => {
  const r = agregarCaptacao(
    [linha({ status: "ABERTO", valorGanho: null })],
    ANTERIOR_ZERO,
  );
  assert.equal(r.convertidos, 0);
  assert.equal(r.valorGerado, 0);
  assert.equal(r.conversao, 0);
});

caso("delta: anterior zero -> null; anterior não-zero -> fração", () => {
  const linhas = [linha({ status: "GANHO", valorGanho: 200 })];
  const rZero = agregarCaptacao(linhas, ANTERIOR_ZERO);
  assert.equal(rZero.delta.total, null);
  assert.equal(rZero.delta.valorGerado, null);
  const rPrev = agregarCaptacao(linhas, { total: 2, conversao: 0.5, valorGerado: 100 });
  // total atual 1 vs 2 -> -0.5 ; valorGerado 200 vs 100 -> +1.0
  assert.ok(Math.abs((rPrev.delta.total as number) - -0.5) < 1e-9);
  assert.ok(Math.abs((rPrev.delta.valorGerado as number) - 1.0) < 1e-9);
});

caso("série agrupa por dia SP (dois no mesmo dia somam)", () => {
  const linhas = [
    linha({ leadId: "a", criadoEm: new Date("2026-10-10T12:00:00Z") }), // 09:00 SP 10/10
    linha({ leadId: "b", criadoEm: new Date("2026-10-10T20:00:00Z") }), // 17:00 SP 10/10
    linha({ leadId: "c", criadoEm: new Date("2026-10-11T12:00:00Z") }), // 09:00 SP 11/10
  ];
  const r = agregarCaptacao(linhas, ANTERIOR_ZERO);
  const d10 = r.serie.find((p) => p.data === "2026-10-10");
  const d11 = r.serie.find((p) => p.data === "2026-10-11");
  assert.ok(d10 && d10.captados === 2);
  assert.ok(d11 && d11.captados === 1);
});

console.log(`\nc9-captacao: ${ok} ok, ${falhou} falhou`);
if (falhou > 0) process.exit(1);

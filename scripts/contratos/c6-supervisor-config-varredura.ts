// Contrato C6 — Config editável + varredura do Supervisor, PURO (sem rede/banco).
//   npx tsx scripts/contratos/c6-supervisor-config-varredura.ts
//
// Trava as invariantes da edição de config (form + IA):
//  1. resolverVarredura — tolerante na LEITURA: default seguro (DESLIGADA),
//     clampa fora de faixa, preserva válido, flags de vigia default true.
//  2. aplicarPatchConfig — estrito na ESCRITA: aplica válido, REJEITA inválido
//     com mensagem, trata metaPeriodoReais 0/null como "sem meta", não muta base.
import assert from "node:assert";
import {
  resolverVarredura,
  resolverLimiares,
  aplicarPatchConfig,
  VARREDURA_PADRAO,
  LIMITES_VARREDURA,
  type ConfigEditavel,
} from "../../src/lib/supervisor/tipos";

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

function baseConfig(): ConfigEditavel {
  return { limiares: resolverLimiares(null), varredura: resolverVarredura(null) };
}

// ───────────────────────── 1) resolverVarredura (leitura tolerante) ─────────

caso("resolverVarredura: vazio => default SEGURO (desligada, vigia tudo true)", () => {
  const v = resolverVarredura(null);
  assert.equal(v.ativa, false);
  assert.equal(v.cadenciaMin, VARREDURA_PADRAO.cadenciaMin);
  assert.deepEqual(v.vigia, {
    semResposta: true,
    semProximoPasso: true,
    parado: true,
    primeiraResposta: true,
  });
});

caso("resolverVarredura: clampa cadência/horas fora de faixa", () => {
  const baixo = resolverVarredura({ cadenciaMin: 1, semRespostaHoras: 0 });
  assert.equal(baixo.cadenciaMin, LIMITES_VARREDURA.cadenciaMin.min);
  assert.equal(baixo.semRespostaHoras, LIMITES_VARREDURA.semRespostaHoras.min);
  const alto = resolverVarredura({ cadenciaMin: 99999, semRespostaHoras: 99999 });
  assert.equal(alto.cadenciaMin, LIMITES_VARREDURA.cadenciaMin.max);
  assert.equal(alto.semRespostaHoras, LIMITES_VARREDURA.semRespostaHoras.max);
});

caso("resolverVarredura: preserva valores válidos e flags parciais", () => {
  const v = resolverVarredura({ ativa: true, cadenciaMin: 60, vigia: { parado: false } });
  assert.equal(v.ativa, true);
  assert.equal(v.cadenciaMin, 60);
  assert.equal(v.vigia.parado, false);
  assert.equal(v.vigia.semResposta, true); // não informado => default
});

// ───────────────────────── 2) aplicarPatchConfig (escrita estrita) ──────────

caso("aplicarPatchConfig: patch válido aplica e NÃO muta a base", () => {
  const base = baseConfig();
  const prazoBase = base.limiares.prazo1aRespostaSeg;
  const r = aplicarPatchConfig(base, { limiares: { prazo1aRespostaSeg: 1800 } });
  assert.ok(r.ok, "deveria aceitar");
  if (r.ok) assert.equal(r.valor.limiares.prazo1aRespostaSeg, 1800);
  assert.equal(base.limiares.prazo1aRespostaSeg, prazoBase, "base não pode mudar");
});

caso("aplicarPatchConfig: metaPeriodoReais 0/null => sem meta (null)", () => {
  const base = baseConfig();
  const z = aplicarPatchConfig(base, { limiares: { metaPeriodoReais: 0 } });
  assert.ok(z.ok && z.valor.limiares.metaPeriodoReais === null);
  const n = aplicarPatchConfig(base, { limiares: { metaPeriodoReais: null } });
  assert.ok(n.ok && n.valor.limiares.metaPeriodoReais === null);
  const v = aplicarPatchConfig(base, { limiares: { metaPeriodoReais: 50000 } });
  assert.ok(v.ok && v.valor.limiares.metaPeriodoReais === 50000);
});

caso("aplicarPatchConfig: rejeita prazo <= 0 e > 24h", () => {
  const base = baseConfig();
  assert.equal(aplicarPatchConfig(base, { limiares: { prazo1aRespostaSeg: 0 } }).ok, false);
  assert.equal(aplicarPatchConfig(base, { limiares: { prazo1aRespostaSeg: 90000 } }).ok, false);
});

caso("aplicarPatchConfig: paradoDiasPadrao só inteiro 1..365", () => {
  const base = baseConfig();
  assert.equal(aplicarPatchConfig(base, { limiares: { paradoDiasPadrao: 0 } }).ok, false);
  assert.equal(aplicarPatchConfig(base, { limiares: { paradoDiasPadrao: 2.5 } }).ok, false);
  assert.equal(aplicarPatchConfig(base, { limiares: { paradoDiasPadrao: 400 } }).ok, false);
  assert.ok(aplicarPatchConfig(base, { limiares: { paradoDiasPadrao: 10 } }).ok);
});

caso("aplicarPatchConfig: peso de cobertura só 0..1", () => {
  const base = baseConfig();
  assert.equal(aplicarPatchConfig(base, { limiares: { pesosCobertura: { QUENTE: 2 } } }).ok, false);
  assert.equal(aplicarPatchConfig(base, { limiares: { pesosCobertura: { FRIO: -0.1 } } }).ok, false);
  const r = aplicarPatchConfig(base, { limiares: { pesosCobertura: { QUENTE: 0.9 } } });
  assert.ok(r.ok && r.valor.limiares.pesosCobertura.QUENTE === 0.9);
  if (r.ok) assert.equal(r.valor.limiares.pesosCobertura.MORNO, base.limiares.pesosCobertura.MORNO);
});

caso("aplicarPatchConfig: varredura cadência/horas fora de faixa REJEITA (não clampa)", () => {
  const base = baseConfig();
  assert.equal(aplicarPatchConfig(base, { varredura: { cadenciaMin: 1 } }).ok, false);
  assert.equal(aplicarPatchConfig(base, { varredura: { cadenciaMin: 2000 } }).ok, false);
  assert.equal(aplicarPatchConfig(base, { varredura: { cadenciaMin: 30.5 } }).ok, false);
  assert.equal(aplicarPatchConfig(base, { varredura: { semRespostaHoras: 0 } }).ok, false);
});

caso("aplicarPatchConfig: liga varredura + toggla vigia, preserva resto", () => {
  const base = baseConfig();
  const r = aplicarPatchConfig(base, {
    varredura: { ativa: true, cadenciaMin: 15, vigia: { parado: false } },
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.varredura.ativa, true);
    assert.equal(r.valor.varredura.cadenciaMin, 15);
    assert.equal(r.valor.varredura.vigia.parado, false);
    assert.equal(r.valor.varredura.vigia.semResposta, true);
  }
  assert.equal(base.varredura.ativa, false, "base não pode mudar");
});

caso("aplicarPatchConfig: tipos errados REJEITAM com mensagem", () => {
  const base = baseConfig();
  const r1 = aplicarPatchConfig(base, { varredura: { ativa: "sim" as unknown as boolean } });
  assert.ok(!r1.ok && typeof r1.erro === "string" && r1.erro.length > 0);
  const r2 = aplicarPatchConfig(base, { varredura: { vigia: { parado: 1 as unknown as boolean } } });
  assert.ok(!r2.ok);
});

caso("aplicarPatchConfig: patch vazio => ok, config inalterada", () => {
  const base = baseConfig();
  const r = aplicarPatchConfig(base, {});
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.valor, base);
});

console.log(`\nC6 supervisor config/varredura: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

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
import {
  resumoVarreduraSupervisor,
  linhasConfig,
  REGISTRO_SISTEMA,
} from "../../src/lib/supervisor/explicativo";
import {
  chaveSla,
  limiarParadoMs,
  estaParado,
  coreParados,
  distribuir1aResposta,
} from "../../src/lib/supervisor/indicadores";

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

// ───────────────────────── 3) Explicativo (documentação viva) ──────────────

caso("resumoVarreduraSupervisor: desligada => cadência 'desligada'", () => {
  const base = baseConfig(); // nasce desligada
  const r = resumoVarreduraSupervisor(base);
  assert.equal(r.cadencia, "desligada");
  assert.ok(/desligada/i.test(r.oQueFaz));
});

caso("resumoVarreduraSupervisor: ligada reflete cadência e só itens marcados", () => {
  const base = baseConfig();
  const p = aplicarPatchConfig(base, {
    varredura: { ativa: true, cadenciaMin: 20, vigia: { parado: false, primeiraResposta: false } },
  });
  assert.ok(p.ok);
  if (p.ok) {
    const r = resumoVarreduraSupervisor(p.valor);
    assert.equal(r.cadencia, "a cada 20 min");
    assert.ok(r.oQueFaz.includes("cliente sem resposta"));
    assert.ok(!r.oQueFaz.includes("parado além do limiar"));
  }
});

caso("linhasConfig: deriva min do prazo e 'sem meta' quando null", () => {
  const base = baseConfig(); // prazo 3600s => 60 min, meta null
  const grupos = linhasConfig(base);
  const prazos = grupos.find((g) => g.grupo === "Prazos & limiares");
  assert.ok(prazos);
  const prazo = prazos!.itens.find((i) => i.rotulo === "Prazo de 1ª resposta");
  assert.equal(prazo!.valor, "60 min");
  const meta = prazos!.itens.find((i) => i.rotulo === "Meta do período");
  assert.equal(meta!.valor, "sem meta");
});

caso("REGISTRO_SISTEMA: não vazio e toda entrada completa", () => {
  assert.ok(REGISTRO_SISTEMA.length >= 5);
  for (const e of REGISTRO_SISTEMA) {
    assert.ok(e.chave && e.nome && e.oQueFaz && e.cadencia && e.le && e.editavel && e.fonte);
  }
});

// ───────────────────── 4) "Parado" — fonte única (painel == varredura) ──────

const DIA = 86_400_000;

caso("limiarParadoMs: SLA por etapa vence o global; fallback global sem SLA", () => {
  const sla = new Map<string, number>([[chaveSla("VENDA", "e1"), 120]]); // 2h
  const comSla = limiarParadoMs("VENDA", "e1", 7, sla);
  assert.deepEqual(comSla, { ms: 120 * 60_000, viaSla: true });
  const semSla = limiarParadoMs("VENDA", "e2", 7, sla);
  assert.deepEqual(semSla, { ms: 7 * DIA, viaSla: false });
});

caso("estaParado: SLA usa >= (na borda conta); global usa > (na borda não conta)", () => {
  const agora = new Date("2026-10-14T12:00:00Z");
  const t = (ms: number) => new Date(agora.getTime() - ms);
  // SLA: exatamente no limiar => parado
  assert.equal(estaParado(t(120 * 60_000), agora, { ms: 120 * 60_000, viaSla: true }), true);
  // global: exatamente no limiar => NÃO parado (> estrito, comportamento antigo)
  assert.equal(estaParado(t(7 * DIA), agora, { ms: 7 * DIA, viaSla: false }), false);
  assert.equal(estaParado(t(7 * DIA + 1), agora, { ms: 7 * DIA, viaSla: false }), true);
});

caso("coreParados: mistura SLA+global; limiarDias null quando veio do SLA", () => {
  const agora = new Date("2026-10-14T12:00:00Z");
  const t = (ms: number) => new Date(agora.getTime() - ms);
  const etapas = [
    { id: "e1", nome: "Novo", ordem: 1 },
    { id: "e2", nome: "Proposta", ordem: 2 },
  ];
  const negocios = [
    { etapaId: "e1", entrouEtapaEm: t(3 * 60 * 60_000), finalidade: "VENDA" }, // 3h, SLA 2h => parado
    { etapaId: "e2", entrouEtapaEm: t(10 * DIA), finalidade: "VENDA" }, // sem SLA, 10d > 7 => parado
    { etapaId: "e2", entrouEtapaEm: t(2 * DIA), finalidade: "VENDA" }, // sem SLA, 2d <= 7 => não
  ];
  const sla = new Map<string, number>([[chaveSla("VENDA", "e1"), 120]]);
  const r = coreParados(etapas, negocios, 7, agora, sla);
  const e1 = r.find((x) => x.etapaId === "e1")!;
  const e2 = r.find((x) => x.etapaId === "e2")!;
  assert.equal(e1.parados, 1);
  assert.equal(e1.limiarDias, null); // veio do SLA
  assert.equal(e2.parados, 1);
  assert.equal(e2.limiarDias, 7); // veio do global
});

caso("distribuir1aResposta: classifica cada tempo na faixa certa (corte superior inclusivo)", () => {
  // 1 em <5min(300), 1 em 5–15(900), 1 em 15–60(3600), 1 em 1–4h(14400), 1 em 4–24h(86400), 1 em >24h
  const tempos = [300, 600, 3600, 10000, 50000, 200000];
  const r = distribuir1aResposta(tempos);
  assert.equal(r.length, 6);
  assert.deepEqual(
    r.map((f) => f.qtd),
    [1, 1, 1, 1, 1, 1],
  );
  assert.equal(r[0].rotulo, "< 5 min");
  assert.equal(r[5].rotulo, "> 24 h");
});

caso("distribuir1aResposta: lista vazia => todas as faixas em 0, soma 0", () => {
  const r = distribuir1aResposta([]);
  assert.equal(r.reduce((s, f) => s + f.qtd, 0), 0);
  assert.equal(r.length, 6);
});

console.log(`\nC6 supervisor config/varredura: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

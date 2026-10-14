// Contrato C7 — Aprendizado do Supervisor, PURO (sem rede/banco).
//   npx tsx scripts/contratos/c7-supervisor-aprendizado.ts
//
// Trava as invariantes do loop de feedback determinístico:
//  1. classificarSinal — texto do motivo → sinal canônico (os 4 da varredura).
//  2. taxaAceitacao — EXECUTADO ÷ (EXEC+DESC); null sem amostra.
//  3. forcaPorAmostra — faixas de força.
//  4. resolverAprendizado — leitura tolerante (defaults, clamp de cadência).
//  5. montarInsights — só emite acima de AMOSTRA.min; marca força; ordena fortes
//     primeiro; teto de 6; sugere desligar sinal muito descartado.
//  6. extrairProducao — tira os números do painel na forma dos insights.
import assert from "node:assert";
import {
  classificarSinal,
  taxaAceitacao,
  forcaPorAmostra,
  montarInsights,
  extrairProducao,
  nomeSinal,
  type EntradaInsights,
} from "../../src/lib/supervisor/aprendizado";
import {
  resolverAprendizado,
  AMOSTRA,
  CADENCIA_ESTUDO_PADRAO,
  LIMITES_APRENDIZADO,
  type AceitacaoItem,
  type SucessoSinal,
  type PainelSupervisor,
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

// ───────────────────────── 1) classificarSinal ─────────────────────────

caso("classificarSinal: os 4 motivos reais da varredura", () => {
  assert.equal(classificarSinal("Sem próximo passo agendado"), "semProximoPasso");
  assert.equal(classificarSinal('Parado há 9 dia(s) em "Proposta"'), "parado");
  assert.equal(classificarSinal("Cliente aguardando resposta (mensagens não lidas)"), "semResposta");
  assert.equal(classificarSinal("Lead novo sem 1ª resposta no prazo"), "primeiraResposta");
});

caso("classificarSinal: vazio/desconhecido => outro", () => {
  assert.equal(classificarSinal(null), "outro");
  assert.equal(classificarSinal(undefined), "outro");
  assert.equal(classificarSinal(""), "outro");
  assert.equal(classificarSinal("qualquer texto de chat"), "outro");
});

caso("classificarSinal: tolera acento/caixa (sem proximo passo / 1a resposta)", () => {
  assert.equal(classificarSinal("SEM PROXIMO PASSO"), "semProximoPasso");
  assert.equal(classificarSinal("primeira resposta estourada"), "primeiraResposta");
});

// ───────────────────────── 2) taxaAceitacao ─────────────────────────

caso("taxaAceitacao: EXEC ÷ (EXEC+DESC)", () => {
  assert.equal(taxaAceitacao(3, 1), 0.75);
  assert.equal(taxaAceitacao(0, 4), 0);
  assert.equal(taxaAceitacao(5, 0), 1);
});

caso("taxaAceitacao: sem amostra => null", () => {
  assert.equal(taxaAceitacao(0, 0), null);
});

// ───────────────────────── 3) forcaPorAmostra ─────────────────────────

caso("forcaPorAmostra: faixas forte/media/fraca", () => {
  assert.equal(forcaPorAmostra(AMOSTRA.forte), "forte");
  assert.equal(forcaPorAmostra(AMOSTRA.forte - 1), "media");
  assert.equal(forcaPorAmostra(AMOSTRA.media), "media");
  assert.equal(forcaPorAmostra(AMOSTRA.media - 1), "fraca");
  assert.equal(forcaPorAmostra(0), "fraca");
});

// ───────────────────────── 4) resolverAprendizado (leitura tolerante) ─────

caso("resolverAprendizado: vazio => default (nunca estudou, cadência padrão)", () => {
  const a = resolverAprendizado(null);
  assert.equal(a.geradoEm, null);
  assert.equal(a.cadenciaHoras, CADENCIA_ESTUDO_PADRAO);
  assert.deepEqual(a.aceitacaoPorSinal, []);
  assert.deepEqual(a.insights, []);
  assert.deepEqual(a.historico, []);
});

caso("resolverAprendizado: clampa cadência fora de faixa", () => {
  assert.equal(resolverAprendizado({ cadenciaHoras: 0 }).cadenciaHoras, LIMITES_APRENDIZADO.cadenciaHoras.min);
  assert.equal(resolverAprendizado({ cadenciaHoras: 9999 }).cadenciaHoras, LIMITES_APRENDIZADO.cadenciaHoras.max);
  assert.equal(resolverAprendizado({ cadenciaHoras: 6 }).cadenciaHoras, 6);
});

caso("resolverAprendizado: preserva listas válidas, descarta lixo", () => {
  const a = resolverAprendizado({
    geradoEm: "2026-10-14T00:00:00.000Z",
    aceitacaoPorSinal: [
      { chave: "parado", executadas: 2, descartadas: 1, taxa: 0.666 },
      { executadas: 1 }, // sem chave → descartado
      "lixo",
    ],
    insights: [{ texto: "oi", forca: "forte" }, { forca: "media" }],
    historico: [{ geradoEm: "x", aceitacaoGeral: 0.5, amostra: 3 }],
  });
  assert.equal(a.geradoEm, "2026-10-14T00:00:00.000Z");
  assert.equal(a.aceitacaoPorSinal.length, 1);
  assert.equal(a.aceitacaoPorSinal[0].chave, "parado");
  assert.equal(a.insights.length, 1);
  assert.equal(a.insights[0].forca, "forte");
  assert.equal(a.historico.length, 1);
});

caso("resolverAprendizado: força inválida cai para 'fraca'", () => {
  const a = resolverAprendizado({ insights: [{ texto: "x", forca: "altíssima" }] });
  assert.equal(a.insights[0].forca, "fraca");
});

// ───────────────────────── 5) montarInsights ─────────────────────────

function entradaVazia(): EntradaInsights {
  return {
    aceitacaoPorSinal: [],
    sucessoPorSinal: [],
    pctPrazo: { pct: null, total: 0 },
    melhorOrigem: null,
    topMotivoPerda: null,
  };
}

caso("montarInsights: sem amostra => nenhum insight", () => {
  assert.deepEqual(montarInsights(entradaVazia()), []);
});

caso("montarInsights: pctPrazo baixo com amostra => insight de velocidade", () => {
  const e = entradaVazia();
  e.pctPrazo = { pct: 0.3, total: 25 };
  const r = montarInsights(e);
  assert.equal(r.length, 1);
  assert.match(r[0].texto, /1ªs? respostas?/i);
  assert.equal(r[0].forca, "forte"); // total 25 >= forte
});

caso("montarInsights: pctPrazo baixo mas amostra < min => sem insight", () => {
  const e = entradaVazia();
  e.pctPrazo = { pct: 0.3, total: AMOSTRA.min - 1 };
  assert.deepEqual(montarInsights(e), []);
});

caso("montarInsights: sinal muito descartado => sugere DESLIGAR (feed do A3)", () => {
  const e = entradaVazia();
  const a: AceitacaoItem = { chave: "parado", executadas: 1, descartadas: 9, taxa: 0.1 };
  e.aceitacaoPorSinal = [a];
  const r = montarInsights(e);
  assert.equal(r.length, 1);
  assert.match(r[0].texto, /desligar/i);
  assert.ok(r[0].texto.includes(nomeSinal("parado")));
});

caso("montarInsights: sinal 'outro' nunca vira sugestão de desligar", () => {
  const e = entradaVazia();
  e.aceitacaoPorSinal = [{ chave: "outro", executadas: 1, descartadas: 20, taxa: 0.05 }];
  assert.deepEqual(montarInsights(e), []);
});

caso("montarInsights: sucesso >=50% com amostra => insight de 'agir ajudou'", () => {
  const e = entradaVazia();
  const s: SucessoSinal = { sinal: "semResposta", executadas: 10, ganhos: 7, taxa: 0.7 };
  e.sucessoPorSinal = [s];
  const r = montarInsights(e);
  assert.equal(r.length, 1);
  assert.match(r[0].texto, /ganho/i);
});

caso("montarInsights: ordena fortes primeiro e limita a 6", () => {
  const e = entradaVazia();
  e.pctPrazo = { pct: 0.3, total: 4 }; // fraca
  e.melhorOrigem = { origem: "Instagram", conversao: 0.6, amostra: 30 }; // forte
  e.topMotivoPerda = { label: "Preço", pctPerdidos: 40, count: 25 }; // forte
  const r = montarInsights(e);
  assert.ok(r.length >= 3);
  assert.equal(r[0].forca, "forte"); // forte veio antes da fraca
  assert.ok(r.length <= 6);
});

// ───────────────────────── 6) extrairProducao ─────────────────────────

function painelFake(): PainelSupervisor {
  return {
    janela: { inicio: "a", fim: "b" },
    finalidade: null,
    geradoEm: "c",
    // só os campos que extrairProducao lê importam; o resto é preenchido mínimo.
    metricas: {} as PainelSupervisor["metricas"],
    indicadores: [],
    funil: [],
    semProximoPasso: { totalAbertos: 0, semProximo: 0, pct: null },
    cobertura: { ponderadoReais: 0, metaRestanteReais: null, cobertura: null },
    pctDentroDoPrazo: { total: 40, dentro: 12, pct: 0.3 },
    perdas: {
      total: 50,
      valorTotal: 0,
      porMotivo: [
        { code: "PRECO", label: "Preço", count: 30, valor: 0, pct: 60 },
        { code: "SUMIU", label: "Sumiu", count: 20, valor: 0, pct: 40 },
      ],
      itens: [],
    },
    parados: [],
    origens: [
      { origem: "Instagram", ganhos: 8, perdas: 2, valorGanho: 0, conversao: 0.8 },
      { origem: "Site", ganhos: 1, perdas: 1, valorGanho: 0, conversao: 0.5 },
      { origem: "Raro", ganhos: 1, perdas: 0, valorGanho: 0, conversao: 1 }, // amostra < min
    ],
    ranking: [],
    limiares: {} as PainelSupervisor["limiares"],
  };
}

caso("extrairProducao: melhor origem respeita amostra mínima e pega a maior conversão", () => {
  const p = extrairProducao(painelFake());
  assert.equal(p.melhorOrigem?.origem, "Instagram"); // 10 >= min, conversão 0.8
  assert.equal(p.pctPrazo.pct, 0.3);
  assert.equal(p.topMotivoPerda?.label, "Preço"); // maior count
  assert.equal(p.topMotivoPerda?.count, 30);
});

caso("extrairProducao + montarInsights: pipeline completo gera insights coerentes", () => {
  const p = extrairProducao(painelFake());
  const r = montarInsights({ aceitacaoPorSinal: [], sucessoPorSinal: [], ...p });
  assert.ok(r.some((i) => /respostas?/i.test(i.texto)));
  assert.ok(r.some((i) => i.texto.includes("Instagram")));
  assert.ok(r.some((i) => i.texto.includes("Preço")));
});

console.log(`\nC7 supervisor aprendizado: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

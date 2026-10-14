// Contrato C5 — Supervisor Comercial IA, PURO (sem rede/banco).
//   npx tsx scripts/contratos/c5-supervisor.ts
//
// Cobre as invariantes que NÃO podem regredir:
//  1. valorEfetivo — o "ponto de atenção nº1" do CRM: valorAjustado, quando
//     != null, MANDA (inclusive 0); só cai em `valor` quando valorAjustado é null.
//     Um valorAjustado=0 pendurado zera a venda — é exatamente o que o teste trava.
//  2. core* dos indicadores (Camada 1) — funções puras sobre fixtures: % no prazo,
//     funil (inclui etapa vazia, ordena por `ordem`, ciclo médio), parados (só
//     acima do limiar, agrupado, desc), sem próximo passo (clamp + pct).
//  3. LINHA VERMELHA ESTRUTURAL (§2): o supervisor é consultor interno e NUNCA
//     fala com o cliente. assertSemEnvioAoCliente DEVE quebrar se uma ferramenta
//     de envio for injetada no registro; o registro real DEVE passar; nenhum nome
//     registrado pode casar com um padrão proibido.
//  4. Integridade do registro de ferramentas de escrita (nome/campos/resolução).
//
// Fora de escopo aqui (coberto por guardas de runtime + a bateria adversarial em
// docs/SANDBOX-BATERIA-ADVERSARIAL-SOL.md): o envelope JSON do provider e o teto
// de gasto (orcamentoIA) — ambos dependem de rede/banco e não são puros.
import assert from "node:assert";
import {
  valorEfetivo,
  corePctPrazo,
  coreFunil,
  coreParados,
  coreSemProximoPasso,
} from "../../src/lib/supervisor/indicadores";
import {
  FERRAMENTAS_ESCRITA,
  assertSemEnvioAoCliente,
  PADROES_PROIBIDOS,
  acharFerramenta,
  nomesFerramentas,
} from "../../src/lib/supervisor/acoes/registro";
import type { FerramentaEscrita } from "../../src/lib/supervisor/acoes/tipos";

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

const DIA = 86_400_000;
const agora = new Date("2026-10-14T12:00:00.000Z");
const diasAtras = (d: number) => new Date(agora.getTime() - d * DIA);

// ───────────────────────── 1) valorEfetivo (bug histórico) ─────────────────

caso("valorEfetivo: valorAjustado=0 MANDA e zera a venda (não cai no valor)", () => {
  assert.equal(valorEfetivo(1000, 0), 0);
});

caso("valorEfetivo: valorAjustado != null sobrepõe valor", () => {
  assert.equal(valorEfetivo(1000, 750), 750);
});

caso("valorEfetivo: valorAjustado null usa valor", () => {
  assert.equal(valorEfetivo(1000, null), 1000);
});

caso("valorEfetivo: ambos null => 0 (nunca NaN)", () => {
  assert.equal(valorEfetivo(null, null), 0);
});

// ───────────────────────── 2) core* dos indicadores ────────────────────────

caso("corePctPrazo: conta tempos <= limiar, inclusive igual", () => {
  const r = corePctPrazo([60, 300, 301, 1000], 300);
  assert.deepEqual(r, { total: 4, dentro: 2, pct: 0.5 });
});

caso("corePctPrazo: amostra vazia => pct null (não 0, não NaN)", () => {
  const r = corePctPrazo([], 300);
  assert.deepEqual(r, { total: 0, dentro: 0, pct: null });
});

caso("coreFunil: inclui etapa vazia, ordena por `ordem`, ciclo médio", () => {
  const etapas = [
    { id: "b", nome: "Proposta", ordem: 2 },
    { id: "a", nome: "Novo", ordem: 1 },
    { id: "c", nome: "Fechamento", ordem: 3 },
  ];
  const negocios = [
    { etapaId: "a", entrouEtapaEm: diasAtras(2), valor: 100, valorAjustado: null },
    { etapaId: "a", entrouEtapaEm: diasAtras(4), valor: 200, valorAjustado: 0 }, // ajustado=0 zera
    { etapaId: "b", entrouEtapaEm: diasAtras(10), valor: 500, valorAjustado: null },
    { etapaId: "zzz", entrouEtapaEm: diasAtras(1), valor: 999, valorAjustado: null }, // fora de escopo: ignora
  ];
  const r = coreFunil(etapas, negocios, agora);
  assert.deepEqual(
    r.map((e) => e.nome),
    ["Novo", "Proposta", "Fechamento"],
  );
  assert.equal(r[0].emAberto, 2);
  assert.equal(r[0].valorEmAberto, 100); // 100 + (ajustado 0) = 100
  assert.equal(r[0].cicloMedioDias, 3); // (2 + 4) / 2
  assert.equal(r[1].emAberto, 1);
  assert.equal(r[2].emAberto, 0);
  assert.equal(r[2].cicloMedioDias, null); // etapa vazia => null, não 0
});

caso("coreParados: só acima do limiar, agrupa, ordena desc, null => (sem etapa)", () => {
  const etapas = [
    { id: "a", nome: "Novo", ordem: 1 },
    { id: "b", nome: "Proposta", ordem: 2 },
  ];
  const negocios = [
    { etapaId: "a", entrouEtapaEm: diasAtras(10) }, // parado
    { etapaId: "a", entrouEtapaEm: diasAtras(8) }, // parado
    { etapaId: "b", entrouEtapaEm: diasAtras(9) }, // parado
    { etapaId: "a", entrouEtapaEm: diasAtras(2) }, // dentro do prazo: ignora
    { etapaId: null, entrouEtapaEm: diasAtras(30) }, // parado, sem etapa
  ];
  const r = coreParados(etapas, negocios, 7, agora);
  assert.equal(r.length, 3);
  assert.equal(r[0].nome, "Novo"); // 2 parados, vem primeiro (desc)
  assert.equal(r[0].parados, 2);
  const semEtapa = r.find((p) => p.etapaId === null);
  assert.ok(semEtapa, "deve haver grupo sem etapa");
  assert.equal(semEtapa!.nome, "(sem etapa)");
  assert.ok(r.every((p) => p.limiarDias === 7));
});

caso("coreSemProximoPasso: semProximo = total - comProximo, clamp >= 0 + pct", () => {
  assert.deepEqual(coreSemProximoPasso(10, 4), {
    totalAbertos: 10,
    semProximo: 6,
    pct: 0.6,
  });
  // comProximo > total (não deveria acontecer, mas não pode virar negativo)
  assert.equal(coreSemProximoPasso(3, 5).semProximo, 0);
  // sem abertos => pct null
  assert.equal(coreSemProximoPasso(0, 0).pct, null);
});

// ───────────────────── 3) Isolamento: nunca fala com o cliente ──────────────

caso("registro real passa na trava de envio ao cliente", () => {
  assert.doesNotThrow(() => assertSemEnvioAoCliente(FERRAMENTAS_ESCRITA));
});

caso("cada padrão proibido injetado QUEBRA a trava", () => {
  for (const proibido of PADROES_PROIBIDOS) {
    const injetada = {
      nome: `${proibido}_cliente`,
      titulo: "x",
      descricao: "x",
      inputSchema: { type: "object", properties: {} },
      preview: async () => "",
      validar: async () => ({ ok: true as const }),
      executar: async () => ({ ok: true, antes: null, depois: null }),
      reverter: async () => ({ ok: true, antes: null, depois: null }),
    } as FerramentaEscrita;
    assert.throws(
      () => assertSemEnvioAoCliente([injetada]),
      new RegExp(proibido),
      `padrão "${proibido}" deveria quebrar a trava`,
    );
  }
});

caso("nenhum nome registrado casa com um padrão proibido", () => {
  for (const nome of nomesFerramentas()) {
    for (const proibido of PADROES_PROIBIDOS) {
      assert.ok(
        !nome.toLowerCase().includes(proibido),
        `"${nome}" casa com proibido "${proibido}"`,
      );
    }
  }
});

// ───────────────────── 4) Integridade do registro ──────────────────────────

caso("as 7 ferramentas de escrita Nível 1 estão registradas", () => {
  assert.deepEqual(nomesFerramentas().sort(), [
    "arquivar_negocio",
    "criar_lembrete",
    "criar_nota",
    "mover_etapa",
    "reatribuir_vendedor",
    "registrar_ganho",
    "registrar_perda",
  ]);
});

caso("acharFerramenta resolve cada nome e devolve null p/ desconhecido", () => {
  for (const nome of nomesFerramentas()) {
    assert.ok(acharFerramenta(nome), `${nome} deveria resolver`);
  }
  assert.equal(acharFerramenta("enviar_whatsapp"), null);
  assert.equal(acharFerramenta(""), null);
});

caso("toda ferramenta tem contrato completo (campos + 4 funções)", () => {
  for (const f of FERRAMENTAS_ESCRITA) {
    assert.ok(f.nome && f.titulo && f.descricao, `${f.nome}: campos de texto`);
    assert.equal(typeof f.preview, "function");
    assert.equal(typeof f.validar, "function");
    assert.equal(typeof f.executar, "function");
    assert.equal(typeof f.reverter, "function");
    assert.equal(
      (f.inputSchema as { type?: string }).type,
      "object",
      `${f.nome}: inputSchema deve ser object`,
    );
  }
});

console.log(`\nC5 supervisor: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

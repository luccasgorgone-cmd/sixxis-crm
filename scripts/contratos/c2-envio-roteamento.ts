// Contrato C2 — roteamento da fachada de saida (F2), PURO (sem rede/banco).
//   npx tsx scripts/contratos/c2-envio-roteamento.ts
//
// Prova a logica de decisao da fachada SEM enviar nada:
//  - o registro resolve EVOLUTION e ainda nao resolve CLOUD_API;
//  - as capacidades da Evolution (sem janela de 24h, com midia/audio/contato);
//  - checarCapacidade recusa uma saida que a conta nao suporta;
//  - enviarPeloCanal falha cedo (sem rede) quando nao ha adaptador do provider.
import assert from "node:assert";
import {
  resolverAdapterEnvio,
  checarCapacidade,
  enviarPeloCanal,
  contaEvolution,
  destinoTelefone,
} from "../../src/lib/canal/envio";
import type {
  CapacidadesCanal,
  ContaCanal,
  IdentidadeExterna,
  SaidaCanonica,
} from "../../src/lib/canal/tipos";

let ok = 0;
let falhou = 0;
function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      ok++;
      console.log(`  ok  ${nome}`);
    })
    .catch((e) => {
      falhou++;
      console.error(
        `FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
}

const DESTINO: IdentidadeExterna = { tipo: "TELEFONE", valor: "5511999990001" };

async function main(): Promise<void> {
  await caso("registro resolve EVOLUTION", () => {
    const a = resolverAdapterEnvio("EVOLUTION");
    assert.ok(a);
    assert.equal(a?.provider, "EVOLUTION");
    assert.equal(a?.capacidades.exigeTemplateForaDaJanela, false);
    assert.equal(a?.capacidades.midia, true);
    assert.equal(a?.capacidades.audioPTT, true);
    assert.equal(a?.capacidades.contato, true);
  });

  await caso("registro resolve CLOUD_API (F4) com janela de 24h", () => {
    const a = resolverAdapterEnvio("CLOUD_API");
    assert.ok(a);
    assert.equal(a?.provider, "CLOUD_API");
    assert.equal(a?.capacidades.exigeTemplateForaDaJanela, true);
    assert.equal(a?.capacidades.midia, true);
    assert.equal(a?.capacidades.contato, true);
  });

  await caso("registro NAO resolve SANDBOX (sem adaptador)", () => {
    assert.equal(resolverAdapterEnvio("SANDBOX"), null);
  });

  await caso("checarCapacidade: canal sem midia recusa IMAGEM", () => {
    const capSemMidia: CapacidadesCanal = {
      texto: true,
      midia: false,
      audioPTT: false,
      reacao: false,
      edicao: false,
      revogar: false,
      contato: false,
      exigeTemplateForaDaJanela: true,
    };
    const saida: SaidaCanonica = { tipo: "IMAGEM", midiaRef: "https://x/y.jpg" };
    const r = checarCapacidade(capSemMidia, saida);
    assert.ok(r);
    assert.equal(r?.ok, false);
    if (r && r.ok === false) assert.equal(r.motivo, "CAPACIDADE_AUSENTE");
  });

  await caso("checarCapacidade: Evolution aceita TEXTO/IMAGEM/AUDIO/CONTATO", () => {
    const cap = resolverAdapterEnvio("EVOLUTION")!.capacidades;
    for (const tipo of ["TEXTO", "IMAGEM", "AUDIO", "CONTATO"] as const) {
      const saida = { tipo, texto: "x", midiaRef: "u", contato: { nome: "n", telefone: "5511" } } as SaidaCanonica;
      assert.equal(checarCapacidade(cap, saida), null);
    }
  });

  await caso("enviarPeloCanal: provider sem adaptador (SANDBOX) -> CONFIG_AUSENTE (sem rede)", async () => {
    const conta: ContaCanal = {
      id: "c1",
      provider: "SANDBOX",
      finalidade: "VENDA",
      refExterna: "pnid-123",
    };
    const r = await enviarPeloCanal(conta, DESTINO, { tipo: "TEXTO", texto: "oi" });
    assert.equal(r.ok, false);
    if (r.ok === false) assert.equal(r.motivo, "CONFIG_AUSENTE");
  });

  await caso("enviarPeloCanal: CLOUD_API sem token no ambiente -> CONFIG_AUSENTE (sem rede)", async () => {
    const conta: ContaCanal = {
      id: "c2",
      provider: "CLOUD_API",
      finalidade: "VENDA",
      refExterna: "pnid-123",
      credencialRef: "TOKEN_CLOUD_INEXISTENTE_NO_TESTE",
    };
    const r = await enviarPeloCanal(conta, DESTINO, { tipo: "TEXTO", texto: "oi" });
    assert.equal(r.ok, false);
    if (r.ok === false) assert.equal(r.motivo, "CONFIG_AUSENTE");
  });

  await caso("contaEvolution: builder monta conta EVOLUTION a partir da instancia", () => {
    const c = contaEvolution("sixx-venda-3");
    assert.equal(c.provider, "EVOLUTION");
    assert.equal(c.refExterna, "sixx-venda-3");
    assert.equal(c.id, "sixx-venda-3");
    assert.equal(c.finalidade, "VENDA"); // placeholder; nao lido na saida Evolution
  });

  await caso("contaEvolution: instancia null/undefined -> refExterna '' (preserva fallback env)", () => {
    assert.equal(contaEvolution(null).refExterna, "");
    assert.equal(contaEvolution(undefined).refExterna, "");
    assert.equal(contaEvolution("x", "POS_VENDA").finalidade, "POS_VENDA");
  });

  await caso("destinoTelefone: builder de destino 1:1 (valor e telefone iguais)", () => {
    const d = destinoTelefone("5511999990001");
    assert.equal(d.tipo, "TELEFONE");
    assert.equal(d.valor, "5511999990001");
    assert.equal(d.telefone, "5511999990001");
  });

  console.log(`\nC2 fachada de saida: ${ok} ok, ${falhou} falha(s)`);
  if (falhou > 0) process.exit(1);
}

void main();

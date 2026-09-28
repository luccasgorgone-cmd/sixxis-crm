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

  await caso("registro ainda NAO resolve CLOUD_API (entra no F4)", () => {
    assert.equal(resolverAdapterEnvio("CLOUD_API"), null);
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

  await caso("enviarPeloCanal: provider sem adaptador -> CONFIG_AUSENTE (sem rede)", async () => {
    const conta: ContaCanal = {
      id: "c1",
      provider: "CLOUD_API",
      finalidade: "VENDA",
      refExterna: "pnid-123",
    };
    const r = await enviarPeloCanal(conta, DESTINO, { tipo: "TEXTO", texto: "oi" });
    assert.equal(r.ok, false);
    if (r.ok === false) assert.equal(r.motivo, "CONFIG_AUSENTE");
  });

  console.log(`\nC2 fachada de saida: ${ok} ok, ${falhou} falha(s)`);
  if (falhou > 0) process.exit(1);
}

void main();

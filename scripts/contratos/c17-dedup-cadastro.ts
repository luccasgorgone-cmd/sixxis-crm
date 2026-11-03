// Contrato dourado C17 — decisao do cadastro manual quando o telefone JA existe.
//   npx tsx scripts/contratos/c17-dedup-cadastro.ts
//
// Regra (pedido direto do Luccas): um numero que ja pertence a OUTRO vendedor na
// finalidade NAO pode ser "assumido" por um vendedor comum — o cadastro e
// BLOQUEADO e so um admin reatribui (transferencia de carteira). Sem dono na
// finalidade, ou ja e do proprio, ou quem cadastra e admin -> pode assumir/
// vincular (nao e roubo de cliente). Sem lead existente -> cria normal.
//
// Prova PURA (sem banco/rede) da funcao de decisao que a rota /api/leads usa.
import assert from "node:assert";
import { decidirCadastroDuplicado } from "../../src/lib/dedupCadastro";

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

caso("sem lead existente -> CRIAR", () => {
  const d = decidirCadastroDuplicado({
    existe: false,
    donoFinalidade: null,
    requesterId: "v1",
    ehAdmin: false,
  });
  assert.deepEqual(d, { acao: "CRIAR" });
});

caso("existe mas SEM dono na finalidade -> ASSUMIR livre (nao e roubo)", () => {
  const d = decidirCadastroDuplicado({
    existe: true,
    donoFinalidade: null,
    requesterId: "v1",
    ehAdmin: false,
  });
  assert.deepEqual(d, { acao: "ASSUMIR", bloqueado: false });
});

caso("existe e e do PROPRIO requester -> ASSUMIR livre", () => {
  const d = decidirCadastroDuplicado({
    existe: true,
    donoFinalidade: "v1",
    requesterId: "v1",
    ehAdmin: false,
  });
  assert.deepEqual(d, { acao: "ASSUMIR", bloqueado: false });
});

caso("existe e e de OUTRO vendedor, nao-admin -> BLOQUEADO", () => {
  const d = decidirCadastroDuplicado({
    existe: true,
    donoFinalidade: "v2",
    requesterId: "v1",
    ehAdmin: false,
  });
  assert.deepEqual(d, { acao: "ASSUMIR", bloqueado: true });
});

caso("existe e e de OUTRO vendedor, mas ADMIN -> pode reatribuir (nao bloqueia)", () => {
  const d = decidirCadastroDuplicado({
    existe: true,
    donoFinalidade: "v2",
    requesterId: "admin1",
    ehAdmin: true,
  });
  assert.deepEqual(d, { acao: "ASSUMIR", bloqueado: false });
});

caso("admin cadastrando numero que ja e DELE mesmo -> livre", () => {
  const d = decidirCadastroDuplicado({
    existe: true,
    donoFinalidade: "admin1",
    requesterId: "admin1",
    ehAdmin: true,
  });
  assert.deepEqual(d, { acao: "ASSUMIR", bloqueado: false });
});

caso("sem lead existente mas com dono nulo e admin -> CRIAR (existe manda)", () => {
  const d = decidirCadastroDuplicado({
    existe: false,
    donoFinalidade: "v2",
    requesterId: "v1",
    ehAdmin: true,
  });
  assert.deepEqual(d, { acao: "CRIAR" });
});

console.log(`\nC17 dedup cadastro (bloqueio cross-vendedor): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

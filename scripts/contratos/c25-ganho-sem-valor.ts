// Contrato dourado C25 — ganho de RETORNO sem valor (frente 4).
//   npx tsx scripts/contratos/c25-ganho-sem-valor.ts
//
// REGRA (pedido direto do Luccas): o cliente que JA comprou volta so para tirar
// duvida, pedir codigo de rastreio ou outro motivo. Ele fecha como GANHO (para
// o card ir/ficar em Vendido), mas NAO contabiliza valor nenhum: nao soma
// faturamento, nao conta como compra, nao dispara Purchase no Meta.
//
// Esta prova trava a LOGICA PURA que separa esse ganho:
//   1) ehGanhoSemValor(code): quais motivos fecham em zero (DUVIDA/RASTREIO/
//      OUTRO) e quais sao venda/pos-venda de verdade (PAGAMENTO/GARANTIA).
//   2) os dois sufixos marcadores (duplicado de movimentacao E atendimento sem
//      cobranca) sao DISTINTOS e ambos desconsiderados por ehGanhoDesconsiderado
//      — e e essa mesma funcao que compras.ts e vendasPeriodo.ts usam para nao
//      contar o retorno como compra nem como venda do periodo.
//
// Sem banco e sem rede: so as funcoes puras compartilhadas.
import assert from "node:assert";
import {
  ehGanhoSemValor,
  TIPOS_GANHO_SEM_VALOR,
  type CodigoTipoGanho,
} from "../../src/lib/tipoGanho";
import {
  ehGanhoDesconsiderado,
  SUFIXO_GANHO_DUPLICADO,
  SUFIXO_GANHO_SEM_VALOR,
} from "../../src/lib/compras";

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

// --- 1) ehGanhoSemValor: quem fecha em zero ---------------------------------

caso("DUVIDA e ganho SEM valor", () => {
  assert.equal(ehGanhoSemValor("DUVIDA"), true);
});

caso("RASTREIO e ganho SEM valor", () => {
  assert.equal(ehGanhoSemValor("RASTREIO"), true);
});

caso("OUTRO e ganho SEM valor", () => {
  assert.equal(ehGanhoSemValor("OUTRO"), true);
});

caso("PAGAMENTO e venda de verdade -> NAO e sem valor", () => {
  assert.equal(ehGanhoSemValor("PAGAMENTO"), false);
});

caso("GARANTIA e pos-venda com pedido proprio -> NAO entra na lista sem valor", () => {
  assert.equal(ehGanhoSemValor("GARANTIA"), false);
});

caso("null/undefined/vazio -> NAO e sem valor (venda nova classica)", () => {
  assert.equal(ehGanhoSemValor(null), false);
  assert.equal(ehGanhoSemValor(undefined), false);
  assert.equal(ehGanhoSemValor(""), false);
});

caso("codigo desconhecido -> NAO e sem valor (nunca zera por engano)", () => {
  assert.equal(ehGanhoSemValor("QUALQUER_COISA"), false);
});

caso("a lista TIPOS_GANHO_SEM_VALOR e exatamente DUVIDA/RASTREIO/OUTRO", () => {
  const esperado: CodigoTipoGanho[] = ["DUVIDA", "RASTREIO", "OUTRO"];
  assert.deepEqual([...TIPOS_GANHO_SEM_VALOR].sort(), [...esperado].sort());
  // PAGAMENTO e GARANTIA JAMAIS podem entrar aqui: seria zerar venda real.
  assert.ok(!(TIPOS_GANHO_SEM_VALOR as string[]).includes("PAGAMENTO"));
  assert.ok(!(TIPOS_GANHO_SEM_VALOR as string[]).includes("GARANTIA"));
});

// --- 2) sufixos marcadores: distintos e ambos desconsiderados ----------------

caso("os dois sufixos sao textos DISTINTOS", () => {
  assert.notEqual(SUFIXO_GANHO_SEM_VALOR, SUFIXO_GANHO_DUPLICADO);
});

caso("descricao com sufixo SEM VALOR -> desconsiderada (frente 4)", () => {
  assert.equal(
    ehGanhoDesconsiderado("Fechado por retorno" + SUFIXO_GANHO_SEM_VALOR),
    true,
  );
});

caso("descricao com sufixo DUPLICADO -> desconsiderada (fatia 9)", () => {
  assert.equal(
    ehGanhoDesconsiderado("Ganho" + SUFIXO_GANHO_DUPLICADO),
    true,
  );
});

caso("ganho de venda de verdade -> CONTA (nao desconsiderado)", () => {
  assert.equal(ehGanhoDesconsiderado("Venda fechada R$ 450"), false);
});

caso("sufixo so vale no FIM da descricao (endsWith, nao contains)", () => {
  assert.equal(
    ehGanhoDesconsiderado(SUFIXO_GANHO_SEM_VALOR + " mas continuou"),
    false,
  );
});

console.log(`\nC25 ganho de retorno sem valor (frente 4): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

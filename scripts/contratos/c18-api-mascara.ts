// Contrato dourado C18 — mascara de PII da API de Leitura v1.
//   npx tsx scripts/contratos/c18-api-mascara.ts
//
// Regra: sem read:pii, todo campo tipo "pii" sai MASCARADO (nunca o valor
// original); com read:pii, sai em claro. A mascara reduz entropia de forma
// deterministica mantendo o ultimo pedaco util. Prova PURA (sem banco/rede).
import assert from "node:assert";
import {
  mascarar,
  mascararTelefone,
  mascararEmail,
  mascararDocumento,
  mascararEndereco,
  mascararNome,
} from "../../src/lib/api-v1/mascara";

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

// --- telefone: nunca revela o numero inteiro, mantem 4 ultimos ---
caso("telefone BR mascara mantem DDD + 4 ultimos e esconde o miolo", () => {
  const original = "11987651234";
  const m = mascararTelefone(original);
  assert.ok(m.includes("1234"), "mantem 4 ultimos");
  assert.ok(!m.includes("987651234"), "nao revela o numero cheio");
  assert.ok(/\*/.test(m), "tem caractere de mascara");
  assert.notEqual(m, original);
});

caso("telefone curto (<4 digitos) vira ****", () => {
  assert.equal(mascararTelefone("12"), "****");
});

// --- email: 1 char local + dominio, nunca o local inteiro ---
caso("email mascara mantem inicial + dominio, esconde o resto do local", () => {
  const m = mascararEmail("luccas.gorgone@gmail.com");
  assert.equal(m, "l***@gmail.com");
  assert.ok(!m.includes("gorgone"), "nao revela o local completo");
});

caso("email sem @ vira ***", () => {
  assert.equal(mascararEmail("semarroba"), "***");
});

// --- documento: so 2 ultimos digitos ---
caso("CPF mascara mantem so 2 ultimos digitos", () => {
  const m = mascararDocumento("123.456.789-01");
  assert.equal(m, "****01");
  assert.ok(!m.includes("123"), "nao revela os primeiros digitos");
});

// --- endereco e nome ---
caso("endereco mascara mantem so a 1a palavra", () => {
  assert.equal(mascararEndereco("Rua das Flores 123 ap 4"), "Rua ...");
});

caso("nome mascara mantem 1o nome + inicial do sobrenome", () => {
  assert.equal(mascararNome("Luccas Gorgone Silva"), "Luccas S.");
});

caso("nome unico fica inteiro (nada a esconder)", () => {
  assert.equal(mascararNome("Luccas"), "Luccas");
});

// --- dispatcher mascarar(valor, estilo) ---
caso("mascarar() roteia por estilo e preserva null/undefined", () => {
  assert.equal(mascarar(null, "telefone"), null);
  assert.equal(mascarar(undefined, "email"), undefined);
  assert.equal(mascarar("11987651234", "telefone"), mascararTelefone("11987651234"));
  assert.equal(mascarar("a@b.com", "email"), "a***@b.com");
});

caso("estilo desconhecido cai no *** (deny-por-padrao, nunca o valor)", () => {
  // @ts-expect-error — forcando estilo invalido em runtime
  const m = mascarar("segredo-sensivel", "inexistente");
  assert.equal(m, "***");
  assert.ok(!String(m).includes("segredo"));
});

caso("mascara e deterministica (mesmo input -> mesmo output)", () => {
  assert.equal(mascararTelefone("11987651234"), mascararTelefone("11987651234"));
  assert.equal(mascararEmail("x@y.com"), mascararEmail("x@y.com"));
});

console.log(`\nC18 API mascara PII (sem read:pii nunca revela): ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);

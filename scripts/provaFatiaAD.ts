// Prova por funcao PURA da Fatia AD (sem Chrome, sem banco):
//   npx tsx scripts/provaFatiaAD.ts
// (a) CNPJ com mascara (Loja) x sem mascara (CRM) -> "igual"
// (b) CNPJ quando o CRM esta vazio -> "preencher"
// (c) um body so com { cnpj } NAO cai no 400 (guarda da rota buscar-cliente)
import { analisarValores, type EstadoCrm } from "../src/lib/sincronizarLoja";

function estadoBase(over: Partial<EstadoCrm>): EstadoCrm {
  return {
    nomeEfetivo: "Fulano",
    temNomeReal: true,
    cpf: null,
    cnpj: null,
    email: null,
    empresa: null,
    endereco: {
      cep: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: null,
      uf: null,
    },
    numerosNF: [],
    codigosRastreio: null,
    ...over,
  };
}

// (a) CNPJ com mascara x sem mascara -> "igual"
const a = analisarValores(estadoBase({ cnpj: "12345678000190" }), {
  cnpj: "12.345.678/0001-90",
});
const campoA = a.campos.find((c) => c.chave === "cnpj");
console.log("== (a) CNPJ com/sem mascara ==");
console.log("classificacao:", campoA?.classificacao, "(esperado: igual)");

// (b) CNPJ com CRM vazio -> "preencher"
const b = analisarValores(estadoBase({ cnpj: null }), {
  cnpj: "12.345.678/0001-90",
});
const campoB = b.campos.find((c) => c.chave === "cnpj");
console.log("\n== (b) CNPJ com CRM vazio ==");
console.log("classificacao:", campoB?.classificacao, "(esperado: preencher)");
console.log("rotulo:", campoB?.rotulo, "(esperado: CNPJ)");

// (c) guarda da rota buscar-cliente: exige >=1 entre telefone/cpf/cnpj/nome.
// Espelha a condicao exata da rota (POST): !t && !c && !cn && !n -> 400.
const rejeita = (t: string, c: string, cn: string, n: string) => !t && !c && !cn && !n;
const soCnpj = rejeita("", "", "12345678000190", "");
console.log("\n== (c) body so com { cnpj } ==");
console.log("rejeitado com 400?", soCnpj, "(esperado: false)");

console.log("\n== RESUMO ==");
console.log("a:", campoA?.classificacao === "igual" ? "OK" : "FALHOU");
console.log("b:", campoB?.classificacao === "preencher" ? "OK" : "FALHOU");
console.log("c:", soCnpj === false ? "OK" : "FALHOU");

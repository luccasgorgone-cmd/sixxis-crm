// Prova por funcao PURA da Fatia AC (sem Chrome, sem banco):
//   npx tsx scripts/provaFatiaAC.ts
// (a) variantesTelefoneBR — tolerancia ao 9o digito/DDI
// (b) classificacao de CPF com/sem mascara -> "igual"
// (c) dataSomenteDia -> dia correto no fuso do Brasil
import { variantesTelefoneBR } from "../src/lib/phone";
import { analisarValores, type EstadoCrm } from "../src/lib/sincronizarLoja";
import { dataSomenteDia } from "../src/lib/data";

// (a)
console.log("== (a) variantesTelefoneBR ==");
console.log('18999998888 ->', variantesTelefoneBR("18999998888"));
console.log('5518999998888 ->', variantesTelefoneBR("5518999998888"));

// (b)
console.log("\n== (b) CPF com mascara (Loja) x sem mascara (CRM) ==");
const estado: EstadoCrm = {
  nomeEfetivo: "Fulano",
  temNomeReal: true,
  cpf: "12345678900",
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
};
const analise = analisarValores(estado, { cpf: "123.456.789-00" });
const campoCpf = analise.campos.find((c) => c.chave === "cpf");
console.log("classificacao cpf:", campoCpf?.classificacao, "(esperado: igual)");

// (c)
console.log("\n== (c) dataSomenteDia no fuso America/Sao_Paulo ==");
const d = dataSomenteDia("2026-07-15");
const exibido = d?.toLocaleDateString("pt-BR", {
  timeZone: "America/Sao_Paulo",
});
console.log("ISO:", d?.toISOString());
console.log("Exibido pt-BR (SP):", exibido, "(esperado: 15/07/2026)");

// Resumo pass/fail
const okA =
  variantesTelefoneBR("18999998888").includes("1899998888") &&
  variantesTelefoneBR("5518999998888").includes("18999998888");
const okB = campoCpf?.classificacao === "igual";
const okC = exibido === "15/07/2026";
console.log("\n== RESUMO ==");
console.log("a:", okA ? "OK" : "FALHOU");
console.log("b:", okB ? "OK" : "FALHOU");
console.log("c:", okC ? "OK" : "FALHOU");

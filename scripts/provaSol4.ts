// Prova da SOL-4 por FUNCAO PURA — nao precisa de banco, nao envia nada:
//   npx tsx scripts/provaSol4.ts
//
// Cobre as duas decisoes que tocam o cliente diretamente:
//   (a) ehOptOut — quem pediu para parar e quem so esta conversando. Um falso
//       positivo aqui desliga o cliente de todas as ondas para sempre; um falso
//       negativo insiste com quem disse nao. Por isso a lista de "atende" tem
//       tantas negativas parciais ("nao sei", "nao agora", "nao entendi").
//   (b) primeiroNomeReal + renderizarMensagem — a saudacao neutra quando nao ha
//       nome de verdade. "Oi 5531988887777" seria pior que "Oi,".
import { ehOptOut } from "../src/lib/recaptacao";
import { renderizarMensagem, primeiroNomeReal } from "../src/lib/recaptacaoPublico";

const CASOS_OPTOUT: [string, boolean][] = [
  // ---- Recusa -> OPTOUT (nunca mais recebe, e a Sol nao responde) ----
  ["não", true],
  ["Não.", true],
  ["NAO", true],
  ["nao obrigado", true],
  ["Não tenho interesse", true],
  ["sem interesse", true],
  ["pode parar de mandar mensagem", true],
  ["me tira dessa lista", true],
  ["quero sair", true],
  ["remover meu numero", true],
  ["descadastrar", true],
  ["STOP", true],
  ["não quero mais receber", true],
  // Gatilho curto sendo praticamente a mensagem inteira (<= 3 palavras).
  ["parar", true],
  ["parar por favor", true],
  ["quero cancelar", true],
  ["cancelar", true],
  ["pare", true],
  ["Sair!", true],
  // Recusas inequivocas em qualquer posicao da frase.
  ["por favor nao me manda mais mensagem", true],
  ["nao envie mais nada pra mim", true],
  ["quero sair da lista de vocês", true],
  ["me remova por favor", true],
  ["nao me perturbe mais", true],
  ["nao quero mais nada", true],
  ["nao quero receber mais nada", true],

  // ---- ARMADILHAS DO HOTFIX: interesse que CONTEM palavra-gatilho ----
  // Antes do hotfix estes viravam OPTOUT por includes() e o cliente
  // interessado era descartado.
  ["qual o preço pra parar de suar? kkk", false],
  ["tem que cancelar minha compra antiga", false],
  ["a bike faz barulho quando vou parar", false],
  ["preciso cancelar o pedido anterior e fazer outro", false],
  ["vou sair de viagem, da pra entregar depois do dia 10?", false],
  ["tem como remover a peça velha e por a nova?", false],
  ["o motor nao para de esquentar, tem solucao?", false],
  // Colisoes que eu encontrei ao escrever o hotfix (nao estavam na lista
  // original) — as duas primeiras sao abertura tipica de quem QUER comprar.
  ["me tira uma duvida: quanto custa o frete?", false],
  ["me tire uma dúvida sobre a garantia", false],
  ["nao quero mais o azul, quero o vermelho", false],
  ["nao quero receber em casa, vou buscar na loja", false],

  // ---- Conversa normal -> a Sol atende ----
  ["não sei ainda", false],
  ["nao agora, me chama semana que vem", false],
  ["não entendi, qual produto?", false],
  ["ainda tenho interesse sim", false],
  ["Oi! Qual o valor?", false],
  ["nao consegui abrir o link", false],
  ["", false],
  ["👍", false],
  ["quanto custa o de 2000w?", false],
];

const TEMPLATE =
  "Oi {{nome}}, tudo bem? Vi que voce falou com a gente e nao seguimos. Ainda tem interesse?";

const CASOS_NOME: { lead: { nomeManual: string | null; pushName: string | null; nome: string | null }; esperado: string | null }[] = [
  { lead: { nomeManual: null, pushName: "Maria Souza", nome: null }, esperado: "Maria" },
  { lead: { nomeManual: null, pushName: null, nome: null }, esperado: null },
  // "nome" que e telefone: nao serve como saudacao.
  { lead: { nomeManual: null, pushName: "5531988887777", nome: null }, esperado: null },
  // Inicial solta: nao serve.
  { lead: { nomeManual: "j", pushName: null, nome: null }, esperado: null },
  { lead: { nomeManual: null, pushName: "joão pedro", nome: null }, esperado: "João" },
];

let falhas = 0;

console.log("=== (a) ehOptOut ===");
for (const [texto, esperado] of CASOS_OPTOUT) {
  const obtido = ehOptOut(texto);
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(
    `${ok ? "OK   " : "FALHA"} | ${esperado ? "OPTOUT " : "atende "} | ${JSON.stringify(texto)}` +
      (ok ? "" : `  -> obtido ${obtido}`),
  );
}

console.log("\n=== (b) primeiroNomeReal + renderizarMensagem ===");
for (const c of CASOS_NOME) {
  const pn = primeiroNomeReal(c.lead);
  const ok = pn === c.esperado;
  if (!ok) falhas++;
  console.log(
    `${ok ? "OK   " : "FALHA"} | nome=${JSON.stringify(pn)} | ${renderizarMensagem(TEMPLATE, pn)}` +
      (ok ? "" : `  -> esperado ${JSON.stringify(c.esperado)}`),
  );
}

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S) — PARE`);
process.exit(falhas === 0 ? 0 : 1);

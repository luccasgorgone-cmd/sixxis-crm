// Simulador de clientes ficticios do Sandbox de Atendimento
// (WORKORDER_ATENDIMENTO_OMNICHANNEL, pedido do Luccas 18/08/2026).
//
// Roteiros CANNED (sem custo de IA no lado "cliente") — reaproveitando os
// padroes REAIS levantados no Marco 0 (14/08/2026, analise historica de
// producao): template de anuncio e a mensagem inicial mais comum, resposta
// numerica solta = metragem, pedido de peca/filtro, pergunta de locacao.
//
// So o lado da Luna consome IA (mesma trava de orcamento de sempre, sem
// bypass) — o cliente ficticio e sempre texto pronto, gratis.
export type RoteiroSandbox = {
  id: string;
  rotulo: string;
  finalidade: "VENDA" | "POS_VENDA";
  passos: string[];
};

export const ROTEIROS_SANDBOX: RoteiroSandbox[] = [
  {
    id: "anuncio_climatizador",
    rotulo: "Anuncio (climatizador)",
    finalidade: "VENDA",
    passos: [
      "Olá! Tenho interesse e queria mais informações, por favor.",
      "12 metros",
      "Qual o valor?",
    ],
  },
  {
    id: "anuncio_bike",
    rotulo: "Anuncio (bike spinning)",
    finalidade: "VENDA",
    passos: [
      "Olá! Tenho interesse nas bikes, por favor.",
      "É pra uso em casa mesmo, uso moderado",
      "Manda o link",
    ],
  },
  {
    id: "duvida_locacao",
    rotulo: "Pergunta de locação",
    finalidade: "VENDA",
    passos: ["Vocês alugam climatizador?", "Entendi, obrigado"],
  },
  {
    id: "peca_filtro",
    rotulo: "Peça / filtro (pós-venda)",
    finalidade: "POS_VENDA",
    passos: [
      "Bom dia, tem filtro colmeia pro meu climatizador?",
      "É o modelo SX100 Trend",
      "Quanto fica?",
    ],
  },
  {
    id: "status_pedido",
    rotulo: "Status de pedido (pós-venda)",
    finalidade: "POS_VENDA",
    passos: ["Cadê meu pedido?", "Comprei semana passada"],
  },
];

export function obterRoteiro(id: string | null | undefined): RoteiroSandbox | undefined {
  if (!id) return undefined;
  return ROTEIROS_SANDBOX.find((r) => r.id === id);
}

const NOMES_FICTICIOS = [
  "Cliente Teste 1",
  "Cliente Teste 2",
  "Cliente Teste 3",
  "Cliente Teste 4",
  "Cliente Teste 5",
];

export function nomeFicticioAleatorio(): string {
  return NOMES_FICTICIOS[Math.floor(Math.random() * NOMES_FICTICIOS.length)];
}

export function roteiroAleatorio(): RoteiroSandbox {
  return ROTEIROS_SANDBOX[Math.floor(Math.random() * ROTEIROS_SANDBOX.length)];
}

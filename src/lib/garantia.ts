// Garantia derivada (Fatia F). FUNCAO PURA, sem I/O: dado um pedido (orcamento
// GANHO) com a DATA DA NF vinculada, calcula por item a validade e se esta
// vigente. Regra do dono:
//   - PRODUTO (finalidade VENDA)  -> dataNF + 1 ANO.
//   - PECA   (finalidade POS_VENDA) -> dataNF + 3 MESES.
//   - Item marcado garantia=true (troca em garantia) segue a regra de PECA.
// Sem NF vinculada, a garantia NAO e calculada (temNF=false).

export type TipoGarantia = "PRODUTO" | "PECA";

// Classifica o item: peca quando e troca em garantia OU o pedido e de pos-venda;
// caso contrario (venda), produto.
export function tipoGarantiaItem(
  finalidade: string,
  garantia: boolean,
): TipoGarantia {
  return garantia || finalidade === "POS_VENDA" ? "PECA" : "PRODUTO";
}

// Meses de cobertura por tipo: produto 12, peca 3.
export function mesesGarantia(tipo: TipoGarantia): number {
  return tipo === "PRODUTO" ? 12 : 3;
}

// Soma meses a uma data sem mutar a original. Faz clamp do dia quando o mes de
// destino nao tem aquele dia (ex.: 31/jan + 1 mes -> ultimo dia de fev).
export function adicionarMeses(base: Date, meses: number): Date {
  const d = new Date(base.getTime());
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  if (d.getDate() < dia) d.setDate(0);
  return d;
}

// Validade final da garantia de um item, a partir da data da NF.
export function validadeGarantia(dataNF: Date, tipo: TipoGarantia): Date {
  return adicionarMeses(dataNF, mesesGarantia(tipo));
}

export type ItemGarantia = {
  descricao: string;
  tipo: TipoGarantia;
  validade: Date;
  vigente: boolean;
};

export type ResumoGarantia = {
  // false = sem NF vinculada -> garantia nao calculada (itens vazio).
  temNF: boolean;
  itens: ItemGarantia[];
  // Validade mais distante do pedido (null quando sem NF ou sem itens).
  validadeFinal: Date | null;
  // Ao menos um item ainda vigente na data de referencia.
  algumVigente: boolean;
};

// Calcula a garantia de um pedido inteiro. `agora` e injetavel (default: momento
// atual) para manter a funcao testavel de forma deterministica.
export function calcularGarantiaPedido(params: {
  finalidade: string;
  dataNF: Date | null;
  itens: { descricao: string; garantia: boolean }[];
  agora?: Date;
}): ResumoGarantia {
  const { finalidade, dataNF, itens } = params;
  const agora = params.agora ?? new Date();
  if (!dataNF) {
    return { temNF: false, itens: [], validadeFinal: null, algumVigente: false };
  }
  const calc: ItemGarantia[] = itens.map((it) => {
    const tipo = tipoGarantiaItem(finalidade, it.garantia);
    const validade = validadeGarantia(dataNF, tipo);
    return {
      descricao: it.descricao,
      tipo,
      validade,
      vigente: validade.getTime() >= agora.getTime(),
    };
  });
  const validadeFinal = calc.length
    ? new Date(Math.max(...calc.map((c) => c.validade.getTime())))
    : null;
  return {
    temNF: true,
    itens: calc,
    validadeFinal,
    algumVigente: calc.some((c) => c.vigente),
  };
}

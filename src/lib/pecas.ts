// Helper de movimentacao de estoque de pecas (Fatia 3.01). Toda alteracao de
// estoque passa por aqui: cria a MovimentacaoPeca (historico imutavel) E atualiza
// ProdutoCatalogo.estoque na MESMA transacao. Aceita um tx externo (Prisma
// TransactionClient) para compor com o fechamento de pedido (baixa na venda de
// pecas) e a reabertura (estorno) — mantendo tudo atomico.
import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";

export type TipoMovPeca = "ENTRADA" | "SAIDA" | "AJUSTE" | "ESTORNO";

// Cliente que funciona tanto com prisma quanto dentro de uma transacao (tx).
type ClientePrisma = Prisma.TransactionClient;

export type MovimentarArgs = {
  pecaId: string;
  tipo: TipoMovPeca;
  // ENTRADA/SAIDA/ESTORNO: quantidade do delta (sempre tratada como positiva).
  // AJUSTE: novo valor ABSOLUTO do estoque (o delta e derivado e registrado).
  quantidade: number;
  motivo?: string | null;
  negocioId?: string | null;
  leadId?: string | null;
  agenteId?: string | null;
  // tx opcional: quando fornecido, compoe a transacao externa (nao abre outra).
  tx?: ClientePrisma;
};

export type MovimentarResultado = {
  movimentacaoId: string;
  estoqueAntes: number;
  estoqueDepois: number;
};

export async function movimentarPeca(
  args: MovimentarArgs,
): Promise<MovimentarResultado> {
  const {
    pecaId,
    tipo,
    motivo = null,
    negocioId = null,
    leadId = null,
    agenteId = null,
  } = args;

  const executar = async (
    client: ClientePrisma,
  ): Promise<MovimentarResultado> => {
    const peca = await client.produtoCatalogo.findUnique({
      where: { id: pecaId },
      select: { estoque: true },
    });
    if (!peca) throw new Error(`peca ${pecaId} nao encontrada`);
    const estoqueAntes = peca.estoque;

    // quantidadeMov e SEMPRE positiva (o tipo da o sinal). estoqueDepois pode
    // ficar NEGATIVO: a baixa nunca trava a operacao (ex.: vender uma peca sem
    // estoque cadastrado ainda) — apenas registramos e a UI sinaliza.
    let estoqueDepois: number;
    let quantidadeMov: number;
    if (tipo === "AJUSTE") {
      // quantidade = novo valor absoluto; o delta (magnitude) fica na movimentacao.
      const alvo = Math.round(args.quantidade);
      estoqueDepois = alvo;
      quantidadeMov = Math.abs(alvo - estoqueAntes);
    } else {
      const q = Math.max(0, Math.round(args.quantidade));
      quantidadeMov = q;
      estoqueDepois = tipo === "SAIDA" ? estoqueAntes - q : estoqueAntes + q;
    }

    const mov = await client.movimentacaoPeca.create({
      data: {
        pecaId,
        tipo,
        quantidade: quantidadeMov,
        motivo,
        negocioId,
        leadId,
        agenteId,
      },
      select: { id: true },
    });
    await client.produtoCatalogo.update({
      where: { id: pecaId },
      data: { estoque: estoqueDepois },
    });
    return { movimentacaoId: mov.id, estoqueAntes, estoqueDepois };
  };

  // Sem tx externo, abrimos a nossa (movimentacao + estoque atomicos).
  return args.tx ? executar(args.tx) : prisma.$transaction(executar);
}

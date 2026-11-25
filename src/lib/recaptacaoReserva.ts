export type AtualizarReservaRecaptacao = (args: {
  where: {
    id: string;
    dataContadorDia: Date;
    enviadosHoje: { gt: number };
  };
  data: { enviadosHoje: { decrement: number } };
}) => Promise<{ count: number }>;

export function criarLiberadorReservaRecaptacao(
  atualizar: AtualizarReservaRecaptacao,
) {
  return (campanhaId: string, dataContadorDia: Date): Promise<{ count: number }> =>
    atualizar({
      where: {
        id: campanhaId,
        dataContadorDia,
        enviadosHoje: { gt: 0 },
      },
      data: { enviadosHoje: { decrement: 1 } },
    });
}

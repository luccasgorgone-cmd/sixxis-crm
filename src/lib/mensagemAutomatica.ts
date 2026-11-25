import { prisma } from "./prisma";
import { enviarPeloCanal } from "./canal/envio";
import type {
  ContaCanal,
  IdentidadeExterna,
  ResultadoEnvioCanonico,
  SaidaCanonica,
} from "./canal/tipos";

export type ResultadoExecucaoAutomatica<T> =
  | {
      executada: false;
      motivo: "MESTRE_DESLIGADO" | "ERRO_LEITURA_MESTRE";
    }
  | { executada: true; resultado: T };

export type ResultadoExecucaoAutomaticaCondicional<T> =
  | ResultadoExecucaoAutomatica<T>
  | {
      executada: false;
      motivo: "PRECONDICAO_NEGADA" | "ERRO_PRECONDICAO";
    };

export type ExecutorMensagemAutomatica = <T>(
  acao: () => Promise<T>,
) => Promise<ResultadoExecucaoAutomatica<T>>;

export type ExecutorMensagemAutomaticaCondicional = <T>(
  precondicao: () => Promise<unknown>,
  acao: () => Promise<T>,
) => Promise<ResultadoExecucaoAutomaticaCondicional<T>>;

type EnviarPeloCanal = (
  conta: ContaCanal,
  destino: IdentidadeExterna,
  saida: SaidaCanonica,
) => Promise<ResultadoEnvioCanonico>;

export function criarExecutorMensagemAutomatica(
  lerMestre: () => Promise<unknown>,
) {
  return async function executar<T>(
    acao: () => Promise<T>,
  ): Promise<ResultadoExecucaoAutomatica<T>> {
    let valorMestre: unknown;
    try {
      valorMestre = await lerMestre();
    } catch (e) {
      console.warn(
        `[mensagem-automatica] erro ao ler mestre; bloqueio fail-closed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { executada: false, motivo: "ERRO_LEITURA_MESTRE" };
    }
    if (valorMestre !== true) {
      return { executada: false, motivo: "MESTRE_DESLIGADO" };
    }
    return { executada: true, resultado: await acao() };
  };
}

export function criarExecutorMensagemAutomaticaCondicional(
  executar: ExecutorMensagemAutomatica,
): ExecutorMensagemAutomaticaCondicional {
  return async function executarSe<T>(
    precondicao: () => Promise<unknown>,
    acao: () => Promise<T>,
  ): Promise<ResultadoExecucaoAutomaticaCondicional<T>> {
    const avaliacao = await executar(async () => {
      try {
        if ((await precondicao()) !== true) {
          return {
            permitida: false as const,
            motivo: "PRECONDICAO_NEGADA" as const,
          };
        }
      } catch (e) {
        console.warn(
          `[mensagem-automatica] erro na precondicao; bloqueio fail-closed: ${e instanceof Error ? e.message : String(e)}`,
        );
        return {
          permitida: false as const,
          motivo: "ERRO_PRECONDICAO" as const,
        };
      }
      return { permitida: true as const };
    });

    if (!avaliacao.executada) return avaliacao;
    if (!avaliacao.resultado.permitida) {
      return { executada: false, motivo: avaliacao.resultado.motivo };
    }
    // Segunda leitura fecha a corrida ON->OFF enquanto a precondicao aguardava
    // o banco. Depois dela, a acao de I/O e o proximo passo imediato.
    return executar(acao);
  };
}

async function lerMestrePersistido(): Promise<boolean> {
  const config = await prisma.configuracaoCRM.findFirst({
    select: { mensagensAutomaticasAtivas: true },
  });
  return config?.mensagensAutomaticasAtivas === true;
}

export const executarMensagemAutomatica =
  criarExecutorMensagemAutomatica(lerMestrePersistido);

export const executarMensagemAutomaticaSe =
  criarExecutorMensagemAutomaticaCondicional(executarMensagemAutomatica);

export function criarEnvioPeloCanalAutomatico(
  executar: ExecutorMensagemAutomatica,
  enviar: EnviarPeloCanal,
) {
  return (
    conta: ContaCanal,
    destino: IdentidadeExterna,
    saida: SaidaCanonica,
  ): Promise<ResultadoExecucaoAutomatica<ResultadoEnvioCanonico>> =>
    executar(() => enviar(conta, destino, saida));
}

export const enviarPeloCanalAutomatico = criarEnvioPeloCanalAutomatico(
  executarMensagemAutomatica,
  enviarPeloCanal,
);

export async function mestreMensagensAutomaticasAtivo(): Promise<boolean> {
  try {
    return await lerMestrePersistido();
  } catch (e) {
    console.warn(
      `[mensagem-automatica] erro ao consultar mestre; assumindo OFF: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}

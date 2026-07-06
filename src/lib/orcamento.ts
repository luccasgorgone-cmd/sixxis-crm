// Helpers do ORCAMENTO-decisao (Fatia 3.07). Server-only (usa Prisma).
import { Prisma } from "../generated/prisma/client";

type ClientePrisma = Prisma.TransactionClient;

// Proximo numero sequencial: (max(numero) ?? 0) + 1, lido DENTRO da transacao.
// numero e @unique: sob concorrencia, duas decisoes podem ler o mesmo max e
// colidir no insert (P2002). O CHAMADOR envolve a transacao inteira em retry
// (ver ehConflitoNumeroOrcamento): a colisao aborta a tx -> a nova tentativa
// recomputa o max. Como a tx e atomica, a baixa de estoque da tentativa perdida
// e desfeita no rollback e so a bem-sucedida persiste (sem baixa dupla).
export async function proximoNumeroOrcamento(
  tx: ClientePrisma,
): Promise<number> {
  const agg = await tx.orcamento.aggregate({ _max: { numero: true } });
  return (agg._max.numero ?? 0) + 1;
}

// Verdadeiro quando o erro e um conflito de unique no campo `numero` do Orcamento
// — sinal para o chamador tentar a transacao de novo com um numero recomputado.
export function ehConflitoNumeroOrcamento(e: unknown): boolean {
  if (
    !(e instanceof Prisma.PrismaClientKnownRequestError) ||
    e.code !== "P2002"
  ) {
    return false;
  }
  const alvo = e.meta?.target;
  const texto = Array.isArray(alvo) ? alvo.join(",") : String(alvo ?? "");
  return texto.includes("numero");
}

// Executa `fn` (idealmente um prisma.$transaction) com ate `tentativas` retries
// quando houver colisao de numero. Cada tentativa e atomica (rollback desfaz a
// baixa perdida), entao repetir e seguro.
export async function comRetryNumeroOrcamento<T>(
  fn: () => Promise<T>,
  tentativas = 5,
): Promise<T> {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (e) {
      if (ehConflitoNumeroOrcamento(e) && i < tentativas - 1) continue;
      throw e;
    }
  }
  // Inalcancavel (o loop retorna ou lanca), mas satisfaz o tipo.
  throw new Error("comRetryNumeroOrcamento: tentativas esgotadas");
}

// Preview da mensagem CITADA (reply) — FORMATO UNICO.
//
// A bolha de citacao (Thread/MiniaturaCitada) precisa exatamente destes campos:
// o rotulo vem de tipo/conteudo/contatoNome/transcricao e a MINIATURA de
// mediaUrl (apagada decide se mostra a thumb). Duas vias montam esse preview —
// a rota GET /api/conversas/[id]/mensagens (usada no F5) e os emits de socket
// "mensagem:nova" (tempo real). Se as duas divergirem, a citacao muda de cara ao
// dar refresh. Por isso o select mora AQUI e as duas o reusam.
import { prisma } from "./prisma";

export const SELECT_CITADA = {
  id: true,
  direcao: true,
  tipo: true,
  conteudo: true,
  contatoNome: true,
  mediaUrl: true,
  transcricao: true,
  apagada: true,
} as const;

// Preview da citada para o payload do socket. Uma unica leitura por id (chave
// primaria) e SO quando a mensagem tem reply — sem reply nao ha consulta.
// Best-effort: falha aqui nunca derruba o emit (a bolha aparece sem a citacao,
// que o F5 recupera).
export async function previewCitada(
  respostaAId?: string | null,
): Promise<Record<string, unknown> | null> {
  if (!respostaAId) return null;
  try {
    return await prisma.mensagem.findUnique({
      where: { id: respostaAId },
      select: SELECT_CITADA,
    });
  } catch {
    return null;
  }
}

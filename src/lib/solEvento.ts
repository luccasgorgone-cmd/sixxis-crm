// Telemetria da Sol (Fatia 2.98 + SOL-2): um SolEvento por decisao/acao.
// Extraido de queue.ts na SOL-4 para o motor de recaptacao registrar seus envios
// pelo MESMO caminho — duas copias divergiriam no primeiro ajuste de custo.
//
// Best-effort por contrato: NUNCA quebra o fluxo de envio que a chamou. Perder
// uma linha de telemetria e aceitavel; derrubar um atendimento nao e.
import { prisma } from "./prisma";
import { custoEstimado } from "./custoIA";

export async function registrarSolEvento(
  conversaId: string,
  leadId: string,
  acao: string,
  motivo?: string | null,
  modelo?: string | null,
  // SOL-2: consumo da decisao. Omitido = acao que nao passou pela IA; grava 0/0
  // (mediu e nao gastou), diferente de NULL (evento anterior a SOL-2).
  uso?: { tokensEntrada: number; tokensSaida: number },
): Promise<void> {
  try {
    const tokensEntrada = uso?.tokensEntrada ?? 0;
    const tokensSaida = uso?.tokensSaida ?? 0;
    await prisma.solEvento.create({
      data: {
        conversaId,
        leadId,
        acao,
        motivo: motivo ?? null,
        modelo: modelo ?? null,
        tokensEntrada,
        tokensSaida,
        // null quando o modelo nao esta na tabela de precos — nao chutamos.
        custoEstimado: custoEstimado(modelo, tokensEntrada, tokensSaida),
      },
    });
  } catch (e) {
    console.warn(
      `[sol] falha ao gravar SolEvento: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// Acoes de SolEvento que sao ATENDIMENTO REATIVO (a Sol reagindo a uma mensagem
// do cliente). A recaptacao (SOL-4) tambem grava SolEvento, mas e acao ATIVA —
// misturar as duas no mesmo denominador faria "% de handoff" cair sozinho a cada
// onda enviada. O dashboard usa esta lista para separar as contas.
export const ACOES_REATIVAS = [
  "responder",
  "handoff",
  "silenciar",
  "colisao_humano",
] as const;

// Acao gravada por envio de recaptacao (SOL-4).
export const ACAO_RECAPTACAO = "recaptacao_envio";

import { prisma } from "@/lib/prisma";

// Janela de atribuicao: so creditamos o anuncio a venda se o PRIMEIRO contato
// (1a mensagem IN do lead) aconteceu ate 60 dias antes do fechamento. Alem
// disso, o toque e velho demais pra ter trazido essa compra.
const JANELA_DIAS = 60;
const JANELA_MS = JANELA_DIAS * 24 * 60 * 60 * 1000;

export type AtribuicaoAnuncio = {
  anuncioIdAtribuido: string | null;
  anuncioTituloAtribuido: string | null;
  anuncioUrlAtribuido: string | null;
  ctwaClidAtribuido: string | null;
  atribuicaoAnuncioEm: Date;
};

/**
 * Congela no Negocio qual anuncio Click-to-WhatsApp trouxe o contato.
 *
 * Fonte = marcadores de first-touch do Lead (gravados na 1a msg IN e nunca
 * sobrescritos; telefone @unique garante 1 lead por contato, entao o marcador
 * do Lead JA E o first-touch do telefone). ADITIVO e idempotente-por-intencao:
 * so grava os 5 campos nullable novos, nunca toca em valor/status/etc.
 *
 * Retorna null (sem gravar) quando:
 *  - o lead nao tem nenhum marcador de anuncio (ctwaClid/anuncioId), ou
 *  - o primeiro toque foi ha mais de 60d do fechamento (fora da janela), ou
 *  - nao ha mensagem IN registrada (nao da pra datar o primeiro toque).
 */
export async function atribuirAnuncioAoNegocio(
  negocioId: string,
  leadId: string,
  fechadoEm: Date,
): Promise<AtribuicaoAnuncio | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      ctwaClid: true,
      anuncioId: true,
      anuncioTitulo: true,
      anuncioUrl: true,
    },
  });

  // Sem marca de anuncio -> nada a atribuir.
  if (!lead || (!lead.ctwaClid && !lead.anuncioId)) return null;

  // Primeiro toque do lead = mensagem IN mais antiga de qualquer conversa dele.
  const primeiraEntrada = await prisma.mensagem.findFirst({
    where: { conversa: { leadId }, direcao: "IN" },
    orderBy: { hora: "asc" },
    select: { hora: true },
  });

  if (!primeiraEntrada) return null;

  // Guarda de janela: toque velho demais nao e creditado.
  const delta = fechadoEm.getTime() - primeiraEntrada.hora.getTime();
  if (delta > JANELA_MS) return null;

  const dados: AtribuicaoAnuncio = {
    anuncioIdAtribuido: lead.anuncioId ?? null,
    anuncioTituloAtribuido: lead.anuncioTitulo ?? null,
    anuncioUrlAtribuido: lead.anuncioUrl ?? null,
    ctwaClidAtribuido: lead.ctwaClid ?? null,
    atribuicaoAnuncioEm: new Date(),
  };

  await prisma.negocio.update({
    where: { id: negocioId },
    data: dados,
  });

  return dados;
}

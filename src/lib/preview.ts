// Gera a previa textual de uma mensagem para a lista de conversas.
// Mensagens de midia (sem texto baixado nesta fase) viram um rotulo curto.
import { TipoMsg } from "../generated/prisma/enums";

const ROTULO_MIDIA: Record<string, string> = {
  [TipoMsg.AUDIO]: "Audio",
  [TipoMsg.IMAGEM]: "Imagem",
  [TipoMsg.VIDEO]: "Video",
  [TipoMsg.DOCUMENTO]: "Documento",
  [TipoMsg.OUTRO]: "Mensagem",
};

export function previewMensagem(
  tipo: string | null | undefined,
  conteudo: string | null | undefined,
): string {
  if (conteudo && conteudo.trim()) return conteudo.trim();
  if (tipo && ROTULO_MIDIA[tipo]) return ROTULO_MIDIA[tipo];
  return "Mensagem";
}

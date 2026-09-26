"use client";

// F7-Calling — icones de chamada e video chamada no cabecalho do chat.
// Aparecem sempre; a discagem real fica atras da flag CHAMADAS_ATIVAS (a tela de
// chamada explica quando estiver bloqueada pela migracao pro WhatsApp oficial).
import { Phone, Video as VideoIcon } from "lucide-react";
import type { TipoChamada } from "@/lib/chamada/tipos";

export function BotoesChamada({
  onLigar,
}: {
  onLigar: (tipo: TipoChamada) => void;
}) {
  return (
    <>
      <button
        onClick={() => onLigar("voz")}
        title="Ligar"
        aria-label="Ligar"
        className="shrink-0 rounded-lg p-1.5 text-medio/60 transition-colors hover:bg-tiffany/10 hover:text-tiffany"
      >
        <Phone className="h-4 w-4" />
      </button>
      <button
        onClick={() => onLigar("video")}
        title="Vídeo chamada"
        aria-label="Vídeo chamada"
        className="shrink-0 rounded-lg p-1.5 text-medio/60 transition-colors hover:bg-tiffany/10 hover:text-tiffany"
      >
        <VideoIcon className="h-4 w-4" />
      </button>
    </>
  );
}

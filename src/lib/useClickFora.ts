import { useEffect, type RefObject } from "react";

// Fecha um popover ao clicar/tocar FORA dele (comportamento WhatsApp). Ignora
// cliques dentro do proprio popover e nos refs passados (ex.: o botao-gatilho,
// para que ele possa alternar sem reabrir imediatamente). So age quando `ativo`.
// Reusavel pelos seletores do inbox (emoji, figurinha e reacao).
export function useClickFora(
  onFora: () => void,
  ativo: boolean,
  refs: Array<RefObject<HTMLElement | null>>,
) {
  useEffect(() => {
    if (!ativo) return;
    function aoApontar(e: MouseEvent | TouchEvent) {
      const alvo = e.target as Node | null;
      if (!alvo) return;
      for (const r of refs) {
        if (r.current && r.current.contains(alvo)) return;
      }
      onFora();
    }
    document.addEventListener("mousedown", aoApontar);
    document.addEventListener("touchstart", aoApontar);
    return () => {
      document.removeEventListener("mousedown", aoApontar);
      document.removeEventListener("touchstart", aoApontar);
    };
    // `refs` sao objetos estaveis (useRef); lidos no evento sempre atualizados.
    // A subscricao depende apenas de `ativo`/`onFora`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, onFora]);
}
